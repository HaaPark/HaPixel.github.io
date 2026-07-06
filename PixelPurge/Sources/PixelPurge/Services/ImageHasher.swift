import Photos
import UIKit

/// Computes a perceptual "average hash" for photos so visually similar images
/// can be grouped even if they aren't byte-for-byte identical.
enum ImageHasher {
    private static let manager = PHImageManager.default()

    static func averageHash(for asset: PHAsset) async -> UInt64? {
        guard let image = await requestThumbnail(for: asset) else { return nil }
        return averageHash(from: image)
    }

    private static func requestThumbnail(for asset: PHAsset) async -> UIImage? {
        await withCheckedContinuation { continuation in
            var didResume = false
            let options = PHImageRequestOptions()
            options.deliveryMode = .fastFormat
            options.resizeMode = .fast
            options.isNetworkAccessAllowed = false
            options.isSynchronous = false

            manager.requestImage(
                for: asset,
                targetSize: CGSize(width: 32, height: 32),
                contentMode: .aspectFill,
                options: options
            ) { image, info in
                let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if isDegraded && image != nil { return }
                guard !didResume else { return }
                didResume = true
                continuation.resume(returning: image)
            }
        }
    }

    private static func averageHash(from image: UIImage) -> UInt64? {
        let hashSize = 8
        guard let cgImage = image.cgImage else { return nil }

        var pixels = [UInt8](repeating: 0, count: hashSize * hashSize)
        guard let context = CGContext(
            data: &pixels,
            width: hashSize,
            height: hashSize,
            bitsPerComponent: 8,
            bytesPerRow: hashSize,
            space: CGColorSpaceCreateDeviceGray(),
            bitmapInfo: CGImageAlphaInfo.none.rawValue
        ) else { return nil }

        context.interpolationQuality = .low
        context.draw(cgImage, in: CGRect(x: 0, y: 0, width: hashSize, height: hashSize))

        let average = pixels.reduce(0) { $0 + Int($1) } / pixels.count
        var hash: UInt64 = 0
        for (index, pixel) in pixels.enumerated() where Int(pixel) >= average {
            hash |= (1 << UInt64(index))
        }
        return hash
    }

    static func hammingDistance(_ a: UInt64, _ b: UInt64) -> Int {
        (a ^ b).nonzeroBitCount
    }
}
