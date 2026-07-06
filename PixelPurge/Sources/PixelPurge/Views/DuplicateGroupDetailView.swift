import SwiftUI
import Photos

struct DuplicateGroupDetailView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let group: DuplicateGroup
    @State private var markedForDeletion: Set<String>
    @State private var isDeleting = false
    @State private var errorMessage: String?

    init(group: DuplicateGroup) {
        self.group = group
        _markedForDeletion = State(initialValue: Set(group.deletableItems.map(\.id)))
    }

    private let columns = [GridItem(.adaptive(minimum: 110), spacing: 8)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(group.items) { item in
                    itemCell(item)
                }
            }
            .padding()
        }
        .navigationTitle("중복 그룹")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) {
                if let errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                Button(role: .destructive) {
                    Task { await deleteMarked() }
                } label: {
                    if isDeleting {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("선택한 \(markedForDeletion.count)장 삭제")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .controlSize(.large)
                .disabled(markedForDeletion.isEmpty || isDeleting)
                .padding()
                .background(.bar)
            }
        }
    }

    private func itemCell(_ item: PhotoAssetInfo) -> some View {
        let isKeep = item.id == group.suggestedKeepID
        let isMarked = markedForDeletion.contains(item.id)

        return VStack(spacing: 6) {
            ZStack(alignment: .topTrailing) {
                PhotoThumbnailView(asset: item.asset, size: CGSize(width: 150, height: 150))
                    .aspectRatio(1, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .opacity(isMarked ? 0.5 : 1.0)

                Image(systemName: isMarked ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isMarked ? Color.red : Color.white)
                    .background(Circle().fill(isMarked ? Color.white : Color.black.opacity(0.3)))
                    .padding(6)
            }
            if isKeep {
                Text("추천 보관")
                    .font(.caption2.bold())
                    .foregroundStyle(.green)
            } else {
                Text("\(item.pixelWidth)×\(item.pixelHeight)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .onTapGesture {
            toggle(item)
        }
    }

    private func toggle(_ item: PhotoAssetInfo) {
        if markedForDeletion.contains(item.id) {
            markedForDeletion.remove(item.id)
        } else {
            markedForDeletion.insert(item.id)
        }
    }

    private func deleteMarked() async {
        isDeleting = true
        errorMessage = nil
        let assetsToDelete = group.items
            .filter { markedForDeletion.contains($0.id) }
            .map(\.asset)
        do {
            try await appState.delete(assets: assetsToDelete)
            await appState.scanForDuplicates()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
        isDeleting = false
    }
}
