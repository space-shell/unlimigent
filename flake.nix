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
        f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            godot_4
            gdtoolkit_4
            jetbrains-mono
            nodejs_22 # legacy web app — removed at G3
          ];
          shellHook = ''
            echo "unlimigent devshell: godot $(godot4 --version | head -n1), gdlint $(gdlint --version 2>/dev/null | head -n1)"
          '';
        };
      });
    };
}
