{ self }:
{ config, lib, pkgs, ... }:
let
  cfg = config.programs.opencode;
in
{
  options.programs.opencode = {
    enable = lib.mkEnableOption "opencode AI coding agent";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.opencode;
      defaultText = lib.literalExpression "pkgs.opencode";
      description = "opencode package to install.";
    };

    enableDesktop = lib.mkEnableOption "opencode desktop app";

    desktopPackage = lib.mkOption {
      type = lib.types.package;
      default = pkgs.opencode-desktop;
      defaultText = lib.literalExpression "pkgs.opencode-desktop";
      description = "opencode desktop package to install.";
    };
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [ self.overlays.default ];

    environment.systemPackages =
      [ cfg.package ]
      ++ lib.optionals cfg.enableDesktop [ cfg.desktopPackage ];
  };
}
