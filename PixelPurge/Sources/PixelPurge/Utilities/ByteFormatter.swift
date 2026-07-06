import Foundation

enum ByteFormatter {
    private static let formatter: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter
    }()

    static func string(from bytes: Int64) -> String {
        formatter.string(fromByteCount: bytes)
    }
}
