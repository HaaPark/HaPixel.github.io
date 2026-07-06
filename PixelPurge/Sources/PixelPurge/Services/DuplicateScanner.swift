import Foundation
import Photos

/// Scans a set of photo assets, computes a perceptual hash for each, and groups
/// visually similar photos together using a union-find over Hamming distance.
actor DuplicateScanner {
    /// Max Hamming distance (out of 64 bits) for two images to be considered near-duplicates.
    private let similarityThreshold = 10

    func findDuplicateGroups(
        in fetchResult: PHFetchResult<PHAsset>,
        progress: @escaping @Sendable (Double, String) -> Void
    ) async -> [DuplicateGroup] {
        let assets = fetchResult.objects(at: IndexSet(0..<fetchResult.count))
        let total = assets.count
        guard total > 1 else { return [] }

        var hashes: [String: UInt64] = [:]
        var infos: [String: PhotoAssetInfo] = [:]
        var completed = 0

        await withTaskGroup(of: (String, UInt64?, PhotoAssetInfo).self) { group in
            var nextIndex = 0
            let concurrencyLimit = min(6, assets.count)

            func enqueueNext() {
                guard nextIndex < assets.count else { return }
                let asset = assets[nextIndex]
                nextIndex += 1
                group.addTask {
                    let hash = await ImageHasher.averageHash(for: asset)
                    return (asset.localIdentifier, hash, PhotoAssetInfo(asset: asset))
                }
            }

            for _ in 0..<concurrencyLimit {
                enqueueNext()
            }

            for await (id, hash, info) in group {
                completed += 1
                if let hash {
                    hashes[id] = hash
                }
                infos[id] = info
                progress(Double(completed) / Double(total), "\(completed)/\(total)장 분석 중")
                enqueueNext()
            }
        }

        return groupSimilarAssets(hashes: hashes, infos: infos)
    }

    private func groupSimilarAssets(
        hashes: [String: UInt64],
        infos: [String: PhotoAssetInfo]
    ) -> [DuplicateGroup] {
        let ids = Array(hashes.keys)
        guard ids.count > 1 else { return [] }

        var parent: [String: String] = [:]
        for id in ids { parent[id] = id }

        func find(_ id: String) -> String {
            var current = id
            while let next = parent[current], next != current {
                current = next
            }
            return current
        }

        func union(_ a: String, _ b: String) {
            let rootA = find(a)
            let rootB = find(b)
            if rootA != rootB {
                parent[rootB] = rootA
            }
        }

        for i in 0..<ids.count {
            guard let hashA = hashes[ids[i]] else { continue }
            var j = i + 1
            while j < ids.count {
                if let hashB = hashes[ids[j]], ImageHasher.hammingDistance(hashA, hashB) <= similarityThreshold {
                    union(ids[i], ids[j])
                }
                j += 1
            }
        }

        var groupedByRoot: [String: [String]] = [:]
        for id in ids {
            groupedByRoot[find(id), default: []].append(id)
        }

        let groups: [DuplicateGroup] = groupedByRoot.values.compactMap { memberIDs in
            guard memberIDs.count > 1 else { return nil }
            let items = memberIDs.compactMap { infos[$0] }
            guard items.count > 1 else { return nil }
            let keep = bestAssetToKeep(among: items)
            return DuplicateGroup(items: items, suggestedKeepID: keep.id)
        }

        return groups.sorted { $0.items.count > $1.items.count }
    }

    private func bestAssetToKeep(among items: [PhotoAssetInfo]) -> PhotoAssetInfo {
        var best = items[0]
        for item in items.dropFirst() where isBetter(item, than: best) {
            best = item
        }
        return best
    }

    /// Favorited photos are never suggested for deletion; otherwise prefer the
    /// higher-resolution copy, and if tied, the older (likely original) one.
    private func isBetter(_ candidate: PhotoAssetInfo, than current: PhotoAssetInfo) -> Bool {
        if candidate.isFavorite != current.isFavorite {
            return candidate.isFavorite
        }
        if candidate.megapixels != current.megapixels {
            return candidate.megapixels > current.megapixels
        }
        let candidateDate = candidate.creationDate ?? .distantPast
        let currentDate = current.creationDate ?? .distantPast
        return candidateDate < currentDate
    }
}
