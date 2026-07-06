import SwiftUI

struct CategoryRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .font(.title3)
                .frame(width: 32)
            VStack(alignment: .leading) {
                Text(title).font(.body)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
        .foregroundStyle(.primary)
    }
}
