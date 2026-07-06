import SwiftUI
import Photos

/// Generic grid for reviewing a flat list of photos/videos (screenshots, large
/// videos, ...) with multi-select and batch delete. Used by ScreenshotsView and
/// LargeVideosView.
struct AssetSelectionGridView: View {
    @EnvironmentObject private var appState: AppState

    let title: String
    let loadAssets: () -> [PhotoAssetInfo]
    let emptyMessage: String

    @State private var items: [PhotoAssetInfo] = []
    @State private var selected: Set<String> = []
    @State private var isLoading = true
    @State private var isDeleting = false
    @State private var errorMessage: String?

    private let columns = [GridItem(.adaptive(minimum: 100), spacing: 6)]

    var body: some View {
        Group {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if items.isEmpty {
                ContentUnavailableView(emptyMessage, systemImage: "photo.on.rectangle")
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(items) { item in
                            cell(for: item)
                        }
                    }
                    .padding(6)
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(selected.count == items.count ? "전체 해제" : "전체 선택") {
                    if selected.count == items.count {
                        selected.removeAll()
                    } else {
                        selected = Set(items.map(\.id))
                    }
                }
                .disabled(items.isEmpty)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !selected.isEmpty {
                VStack(spacing: 8) {
                    if let errorMessage {
                        Text(errorMessage).font(.caption).foregroundStyle(.red)
                    }
                    Button(role: .destructive) {
                        Task { await deleteSelected() }
                    } label: {
                        if isDeleting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("선택한 \(selected.count)개 삭제")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .controlSize(.large)
                    .disabled(isDeleting)
                    .padding()
                    .background(.bar)
                }
            }
        }
        .task {
            items = loadAssets()
            isLoading = false
        }
    }

    private func cell(for item: PhotoAssetInfo) -> some View {
        let isSelected = selected.contains(item.id)
        return ZStack(alignment: .topTrailing) {
            PhotoThumbnailView(asset: item.asset, size: CGSize(width: 120, height: 120))
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .opacity(isSelected ? 0.5 : 1.0)
            Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isSelected ? Color.red : Color.white)
                .background(Circle().fill(isSelected ? Color.white : Color.black.opacity(0.3)))
                .padding(4)
        }
        .onTapGesture {
            if isSelected {
                selected.remove(item.id)
            } else {
                selected.insert(item.id)
            }
        }
    }

    private func deleteSelected() async {
        isDeleting = true
        errorMessage = nil
        let assets = items.filter { selected.contains($0.id) }.map(\.asset)
        do {
            try await appState.delete(assets: assets)
            items.removeAll { selected.contains($0.id) }
            selected.removeAll()
            await appState.loadSummary()
        } catch {
            errorMessage = error.localizedDescription
        }
        isDeleting = false
    }
}
