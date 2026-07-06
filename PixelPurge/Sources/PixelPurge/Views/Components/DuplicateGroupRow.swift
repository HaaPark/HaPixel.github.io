import SwiftUI
import Photos

struct DuplicateGroupRow: View {
    let group: DuplicateGroup

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                ForEach(Array(group.items.prefix(3).enumerated()), id: \.offset) { index, item in
                    PhotoThumbnailView(asset: item.asset, size: CGSize(width: 56, height: 56))
                        .frame(width: 56, height: 56)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(.background, lineWidth: 2))
                        .offset(x: CGFloat(index) * 14)
                }
            }
            .frame(width: 84, alignment: .leading)

            VStack(alignment: .leading, spacing: 4) {
                Text("사진 \(group.items.count)장")
                    .font(.body.bold())
                Text("절약 가능: \(ByteFormatter.string(from: group.potentialSavingsBytes))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
