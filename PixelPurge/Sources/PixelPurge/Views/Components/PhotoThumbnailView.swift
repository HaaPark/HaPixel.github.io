import SwiftUI
import Photos

struct PhotoThumbnailView: View {
    let asset: PHAsset
    var size: CGSize = CGSize(width: 160, height: 160)

    @State private var image: UIImage?
    private static let manager = PHImageManager.default()

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle()
                    .fill(.quaternary)
            }
        }
        .clipped()
        .task(id: asset.localIdentifier) {
            await loadThumbnail()
        }
    }

    private func loadThumbnail() async {
        let scale = UIScreen.main.scale
        let targetSize = CGSize(width: size.width * scale, height: size.height * scale)
        let options = PHImageRequestOptions()
        options.deliveryMode = .opportunistic
        options.resizeMode = .fast
        options.isNetworkAccessAllowed = true

        let stream = AsyncStream<UIImage?> { continuation in
            let requestID = Self.manager.requestImage(
                for: asset,
                targetSize: targetSize,
                contentMode: .aspectFill,
                options: options
            ) { image, info in
                continuation.yield(image)
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if !isDegraded {
                    continuation.finish()
                }
            }
            continuation.onTermination = { _ in
                Self.manager.cancelImageRequest(requestID)
            }
        }

        for await result in stream where result != nil {
            image = result
        }
    }
}
