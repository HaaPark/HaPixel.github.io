import Foundation
import Photos

@MainActor
final class AppState: ObservableObject {
    @Published var authorizationStatus: PHAuthorizationStatus = .notDetermined
    @Published var librarySummary: LibrarySummary?
    @Published var duplicateGroups: [DuplicateGroup] = []
    @Published var isScanning = false
    @Published var scanProgress: Double = 0
    @Published var scanStatusText: String = ""

    let photoLibraryService = PhotoLibraryService()
    private let duplicateScanner = DuplicateScanner()
    private let storageAnalyzer = StorageAnalyzer()

    func refreshAuthorizationStatus() {
        authorizationStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    func requestAuthorization() async {
        authorizationStatus = await photoLibraryService.requestAuthorization()
    }

    func loadSummary() async {
        guard authorizationStatus == .authorized || authorizationStatus == .limited else { return }
        let assets = photoLibraryService.fetchAllAssets()
        librarySummary = await storageAnalyzer.summarize(assets: assets)
    }

    func scanForDuplicates() async {
        guard !isScanning else { return }
        isScanning = true
        scanProgress = 0
        scanStatusText = ""
        defer { isScanning = false }

        let assets = photoLibraryService.fetchImageAssets()
        let groups = await duplicateScanner.findDuplicateGroups(in: assets) { [weak self] progress, statusText in
            Task { @MainActor in
                self?.scanProgress = progress
                self?.scanStatusText = statusText
            }
        }
        duplicateGroups = groups
    }

    func delete(assets: [PHAsset]) async throws {
        try await photoLibraryService.delete(assets: assets)
    }
}
