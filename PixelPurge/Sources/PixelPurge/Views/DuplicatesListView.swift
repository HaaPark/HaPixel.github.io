import SwiftUI

struct DuplicatesListView: View {
    @EnvironmentObject private var appState: AppState

    private var totalPotentialSavings: Int64 {
        appState.duplicateGroups.reduce(0) { $0 + $1.potentialSavingsBytes }
    }

    var body: some View {
        NavigationStack {
            Group {
                if appState.isScanning {
                    VStack(spacing: 16) {
                        ProgressView(value: appState.scanProgress)
                            .padding(.horizontal, 40)
                        Text(appState.scanStatusText)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else if appState.duplicateGroups.isEmpty {
                    ContentUnavailableView(
                        "아직 결과가 없어요",
                        systemImage: "square.on.square",
                        description: Text("홈 탭에서 '중복 사진 찾기'를 먼저 실행해 주세요.")
                    )
                } else {
                    List {
                        Section {
                            HStack {
                                Text("확보 가능한 용량")
                                Spacer()
                                Text(ByteFormatter.string(from: totalPotentialSavings))
                                    .bold()
                            }
                        }
                        Section("그룹 \(appState.duplicateGroups.count)개") {
                            ForEach(appState.duplicateGroups) { group in
                                NavigationLink {
                                    DuplicateGroupDetailView(group: group)
                                } label: {
                                    DuplicateGroupRow(group: group)
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("중복 사진")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await appState.scanForDuplicates() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(appState.isScanning)
                }
            }
        }
    }
}
