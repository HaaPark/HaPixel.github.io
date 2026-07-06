import Foundation
import Photos

actor StorageAnalyzer {
    func summarize(assets fetchResult: PHFetchResult<PHAsset>) async -> LibrarySummary {
        var summary = LibrarySummary()
        let assets = fetchResult.objects(at: IndexSet(0..<fetchResult.count))

        for asset in assets {
            switch asset.mediaType {
            case .image:
                summary.totalPhotoCount += 1
            case .video:
                summary.totalVideoCount += 1
            default:
                break
            }
            if asset.mediaSubtypes.contains(.photoScreenshot) {
                summary.screenshotCount += 1
            }
            if asset.mediaSubtypes.contains(.photoLive) {
                summary.livePhotoCount += 1
            }

            if let bytes = estimatedLocalSize(for: asset) {
                summary.estimatedTotalBytes += bytes
                if asset.mediaSubtypes.contains(.photoScreenshot) {
                    summary.estimatedScreenshotBytes += bytes
                }
                if asset.mediaType == .video {
                    summary.estimatedVideoBytes += bytes
                }
            } else {
                summary.assetsMissingLocalSize += 1
            }
        }

        return summary
    }

    /// Best-effort size for resources already downloaded to the device, read via
    /// PHAssetResource's "fileSize" key. This key isn't part of the public SDK
    /// surface but has been stable for years and is widely relied on for exactly
    /// this purpose (there's no public API for on-device asset byte size).
    /// Returns nil for iCloud-only assets so we never trigger a network download
    /// just to measure size.
    private func estimatedLocalSize(for asset: PHAsset) -> Int64? {
        let resources = PHAssetResource.assetResources(for: asset)
        var total: Int64 = 0
        var foundAny = false
        for resource in resources {
            if let sizeValue = resource.value(forKey: "fileSize") as? Int64 {
                total += sizeValue
                foundAny = true
            }
        }
        return foundAny ? total : nil
    }
}
