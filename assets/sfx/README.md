# Sound Effects Guide

These sound effects are a small CC0 starter pack for the merge gameplay loop. They are copied from Kenney's Interface Sounds and Digital Audio packs, then renamed by intended in-game use.

## Event Map

| File | Suggested use | Notes |
| --- | --- | --- |
| `ui_tap.ogg` | Button clicks, menu selection, close/open UI | Short and neutral; safe for frequent UI interactions. |
| `item_pickup.ogg` | Player starts dragging or selecting a curio item | Light pluck; gives tactile feedback without sounding like a completed action. |
| `item_drop.ogg` | Item is released onto a grid slot or shelf | Use after drag end when the placement is valid. |
| `merge_pop_01.ogg` | Basic successful merge | First merge tier; keep this as the default merge confirmation. |
| `merge_pop_02.ogg` | Slightly better successful merge | Use for higher-tier items or a second combo step. |
| `merge_pop_03.ogg` | Strong successful merge | Use for rare/high-tier merges or a third combo step. |
| `merge_success_sparkle.ogg` | Magical merge flourish | Layer after `merge_pop_01.ogg` for witchy sparkle, or use alone for special recipes. |
| `merge_chain.ogg` | Chain combo / cascading merge | Play when one merge triggers another merge automatically. |
| `unlock_new_item.ogg` | New curio discovered, new recipe unlocked | Positive power-up tone; good for collection progress. |
| `invalid_move.ogg` | Cannot merge, invalid slot, insufficient resource | Keep volume lower than success sounds to avoid fatigue. |
| `reward_coin.ogg` | Coins, dust, essence, or shop reward gained | Glassy tick; can be played repeatedly for small reward increments. |
| `level_up.ogg` | Player level/shop level/major milestone | Larger rising tone; reserve for bigger progression moments. |

## Implementation Tips

- For combos, play `merge_pop_01.ogg`, `merge_pop_02.ogg`, and `merge_pop_03.ogg` in sequence as the combo count increases.
- For a more magical merge, play `merge_pop_01.ogg` and then `merge_success_sparkle.ogg` with a 40–80ms delay.
- For frequent events like drag/drop, keep volume around 40–60% of reward and unlock sounds.
- Browser path example: `assets/sfx/merge_pop_01.ogg`.

## Sources & License

All curated `.ogg` files in this folder are from Kenney and are licensed under Creative Commons Zero (CC0), which allows personal and commercial use without required attribution.

- Kenney Interface Sounds: https://kenney.nl/assets/interface-sounds
- Kenney Digital Audio: https://kenney.nl/assets/digital-audio
- Source archives and license text are stored in `_sources/`.
