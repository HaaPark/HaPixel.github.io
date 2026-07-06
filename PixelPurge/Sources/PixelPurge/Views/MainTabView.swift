import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("홈", systemImage: "house") }
            DuplicatesListView()
                .tabItem { Label("중복 사진", systemImage: "square.on.square") }
            SettingsView()
                .tabItem { Label("설정", systemImage: "gearshape") }
        }
    }
}
