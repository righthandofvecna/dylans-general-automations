[![foundry-shield]][foundry-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![All Release Downloads](https://img.shields.io/github/downloads/righthandofvecna/dylans-general-automations/total.svg)]()

# Dylan's General Automations Module

## Overview

Installable with this link (through the normal Foundry module interface): `https://github.com/righthandofvecna/dylans-general-automations/releases/latest/download/module.json`

This module adds support for:

- Token and Tile collisions (tokens can't enter each other's spaces, as if there were walls around the tokens, and tiles can be configured as solid)
- Restricting movement to keyboard-only or disallowing diagonals on a per-scene basis
- Sliding Ice, One-Way Jumps, and scene-to-scene doors (usable through Foundry v13's "Regions" tool)
- Tile Scripts, which are scripts that run when the user interacts with a tile. A tool for quickly placing signs is also included.
- Token Scripts, which are scripts that run when the user interacts with a token. You can also add dialogue to a token!
- Interacting with things like Item Piles with the Enter button (configurable), or opening unlocked doors with Enter

## Usage

### Interacting with Rocks/Signs/etc

To interact with an already placed object, select your character's token, move it up to the object (be sure it's facing the object) and press `Enter`. This should trigger whatever behavior is defined for that tile/region.

### Interactable Tiles

Select the tool on the Tile layer and double-click the spot you want to place the tile, or click on the tool and drag onto the map, releasing where you want to place the tile.

While the tool is selected, you can also click and drag on the map to place multiple sequential tiles (for tiles that don't require configuration).

### Interactable Tokens

Open the Token Configuration page (double-right click a token) and navigate to the tab with the `🧩 (Puzzle Piece)` icon. You can set dialogue there, or an interaction script that will run when another character faces this token and presses `Enter`. You cannot have both dialogue and an interaction script defined; to show the interaction script controls, remove the dialogue text.

### Region Tools

On the Regions layer, while editing a region, you can add new behaviors as defined in this module. To add, click the `Behaviors` tab, and then click the `🧩 (Puzzle Piece)` icon. This should bring up a wizard to run you through, step-by-step, adding the following features: Sliding Ice and One-Way-Jumps


[foundry-shield]: https://img.shields.io/badge/Foundry-v13.351-success
[foundry-url]: https://foundryvtt.com/
[forks-shield]: https://img.shields.io/github/forks/righthandofvecna/dylans-general-automations.svg
[forks-url]: https://github.com/righthandofvecna/dylans-general-automations/network/members
[stars-shield]: https://img.shields.io/github/stars/righthandofvecna/dylans-general-automations.svg
[stars-url]: https://github.com/righthandofvecna/dylans-general-automations/stargazers
[issues-shield]: https://img.shields.io/github/issues/righthandofvecna/dylans-general-automations.svg
[issues-url]: https://github.com/righthandofvecna/dylans-general-automations/issues
