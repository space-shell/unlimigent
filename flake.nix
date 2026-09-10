{
  description = "unlimigent - spatial agent orchestration game devshell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems =
        f: nixpkgs.lib.genAttrs systems (
          system:
          f (import nixpkgs {
            inherit system;
            config = {
              allowUnfree = true; # android sdk components
              android_sdk.accept_license = true; # godot android export
            };
          })
        );
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            godot_4
            gdtoolkit_4
            jetbrains-mono
            nodejs_22 # legacy web app — removed at G3
            jdk17 # godot android export: apksigner needs java
          ];
          # godot expects the classic layout (platform-tools/, build-tools/)
          ANDROID_HOME = "${(pkgs.androidenv.composeAndroidPackages { }).androidsdk}/libexec/android-sdk";
          shellHook = ''
            echo "unlimigent devshell: godot $(godot4 --version | head -n1), gdlint $(gdlint --version 2>/dev/null | head -n1)"
            # point godot editor settings at the store android sdk + jdk (idempotent)
            for es in "$HOME"/.config/godot/editor_settings-*.tres; do
              [ -f "$es" ] || continue
              sed -i "s|^export/android/java_sdk_path = .*|export/android/java_sdk_path = \"${pkgs.jdk17}\"|" "$es"
              sed -i "s|^export/android/android_sdk_path = .*|export/android/android_sdk_path = \"$ANDROID_HOME\"|" "$es"
            done
          '';
        };
      });
    };
}
