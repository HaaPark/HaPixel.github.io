import Foundation

struct LibrarySummary {
    var totalPhotoCount: Int = 0
    var totalVideoCount: Int = 0
    var screenshotCount: Int = 0
    var livePhotoCount: Int = 0
    var estimatedTotalBytes: Int64 = 0
    var estimatedScreenshotBytes: Int64 = 0
    var estimatedVideoBytes: Int64 = 0
    /// Assets only present in iCloud (not downloaded locally) whose size we skip
    /// rather than forcing a network download just to measure them.
    var assetsMissingLocalSize: Int = 0
}
