import SwiftUI
import Photos

struct RootView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        Group {
            switch appState.authorizationStatus {
            case .authorized, .limited:
                MainTabView()
            case .notDetermined:
                OnboardingPermissionView()
            case .denied, .restricted:
                PermissionDeniedView()
            @unknown default:
                PermissionDeniedView()
            }
        }
        .onAppear {
            appState.refreshAuthorizationStatus()
        }
        .task {
            if appState.authorizationStatus == .authorized || appState.authorizationStatus == .limited {
                await appState.loadSummary()
            }
        }
    }
}
