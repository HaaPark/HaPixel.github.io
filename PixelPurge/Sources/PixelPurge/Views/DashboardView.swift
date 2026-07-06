import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if let summary = appState.librarySummary {
                        StorageSummaryCard(summary: summary)

                        NavigationLink {
                            ScreenshotsView()
                        } label: {
                            CategoryRow(
                                icon: "camera.viewfinder",
                                title: "스크린샷",
                                subtitle: "\(summary.screenshotCount)개 · \(ByteFormatter.string(from: summary.estimatedScreenshotBytes))"
                            )
                        }

                        NavigationLink {
                            LargeVideosView()
                        } label: {
                            CategoryRow(
                                icon: "video",
                                title: "동영상",
                                subtitle: "\(summary.totalVideoCount)개 · \(ByteFormatter.string(from: summary.estimatedVideoBytes))"
                            )
                        }
                    } else {
                        ProgressView("불러오는 중...")
                            .padding(.top, 60)
                    }

                    Button {
                        Task { await appState.scanForDuplicates() }
                    } label: {
                        Label("중복 사진 찾기", systemImage: "magnifyingglass")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(appState.isScanning)
                }
                .padding()
            }
            .navigationTitle("PixelPurge")
            .refreshable {
                await appState.loadSummary()
            }
            .overlay {
                if appState.isScanning {
                    ScanProgressOverlay()
                }
            }
        }
    }
}
