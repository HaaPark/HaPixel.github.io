import Foundation

struct DuplicateGroup: Identifiable {
    let id = UUID()
    var items: [PhotoAssetInfo]
    var suggestedKeepID: String

    var deletableItems: [PhotoAssetInfo] {
        items.filter { $0.id != suggestedKeepID }
    }

    var potentialSavingsBytes: Int64 {
        deletableItems.reduce(0) { $0 + ($1.estimatedBytes ?? 0) }
    }
}
