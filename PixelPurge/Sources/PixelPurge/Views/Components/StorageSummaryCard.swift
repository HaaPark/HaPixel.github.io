import SwiftUI

struct StorageSummaryCard: View {
    let summary: LibrarySummary

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("내 사진보관함")
                .font(.headline)
            HStack {
                StatColumn(title: "사진", value: "\(summary.totalPhotoCount)")
                StatColumn(title: "동영상", value: "\(summary.totalVideoCount)")
                StatColumn(title: "라이브포토", value: "\(summary.livePhotoCount)")
            }
            Divider()
            HStack {
                Text("기기에 저장된 용량 (추정)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(ByteFormatter.string(from: summary.estimatedTotalBytes))
                    .font(.subheadline.bold())
            }
            if summary.assetsMissingLocalSize > 0 {
                Text("iCloud에만 있는 항목 \(summary.assetsMissingLocalSize)개는 용량 계산에서 제외됐어요.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

private struct StatColumn: View {
    let title: String
    let value: String

    var body: some View {
        VStack {
            Text(value).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}
