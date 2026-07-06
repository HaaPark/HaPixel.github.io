import Foundation
import Photos

struct PhotoAssetInfo: Identifiable, Hashable {
    let id: String
    let asset: PHAsset
    let pixelWidth: Int
    let pixelHeight: Int
    let creationDate: Date?
    let isFavorite: Bool
    let isScreenshot: Bool
    let isLivePhoto: Bool
    var estimatedBytes: Int64?

    init(asset: PHAsset, estimatedBytes: Int64? = nil) {
        self.id = asset.localIdentifier
        self.asset = asset
        self.pixelWidth = asset.pixelWidth
        self.pixelHeight = asset.pixelHeight
        self.creationDate = asset.creationDate
        self.isFavorite = asset.isFavorite
        self.isScreenshot = asset.mediaSubtypes.contains(.photoScreenshot)
        self.isLivePhoto = asset.mediaSubtypes.contains(.photoLive)
        self.estimatedBytes = estimatedBytes
    }

    static func == (lhs: PhotoAssetInfo, rhs: PhotoAssetInfo) -> Bool {
        lhs.id == rhs.id
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    var megapixels: Double {
        Double(pixelWidth * pixelHeight) / 1_000_000
    }
}
