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
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [ self.overlays.default ];
    home.packages = [ cfg.package ];
  };
}
