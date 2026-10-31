# stutWith

Who says echo is just for sound? stutWith stutters a photo: it cuts the photo into slices and repeats the slice at the anchor outwards, each copy nudged a little further on. Nothing is generated: every slice is a window onto the photo.

All the controls live under the green **Menu** tab (top left); the green **?** (top right) opens the credit. The menu is grouped by what controls do. Buttons with red < > ends step through choices; on/off buttons turn yellow when on. Sliders fill blue as far as they're turned and carry no numbers, so hover one (or drag it) and a grey bar under the photo reads out its value and what it does.

Everything runs in the browser. There's no build step and no server code. On a phone, opening the menu splits it in two, half above the photo and half below.

## Run it

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

Run it from a server like this rather than opening `index.html` straight from disk: Light and Sort read the photo's brightness, and a page opened from disk may not be allowed to read an uploaded photo's pixels.

## How the stutter works

Every slice shows a window of the photo the same size as itself. The window's middle sits at the anchor plus the slice's distance from the anchor times **Step**:

- **100%**: every slice shows itself, so the photo is untouched.
- **0%**: every slice shows the anchor, so one slice repeats right across.
- **Between**: copies creep outwards, so the photo smears and stretches from the anchor.
- **Above 100%**: copies skip ahead, so the photo squeezes.
- **Below 0**: copies run backwards.

Pinch (or Ctrl/Cmd + scroll) to zoom in round the pointer, scroll or Space + drag to move around, and press 0 to fit the photo again. Drag on the photo to move the anchor. It can go off the photo too, up to a photo's width or height past each edge, so the stutter grows in from outside the picture; grab the anchor wherever it is to bring it back. Double-click to put the anchor back in the middle.

## Controls

| Control | What it does |
|---|---|
| Direction | **Across** (slices side by side), **Down** (stacked), **Both** (a grid that stutters both ways: Slices sets the columns, Bands the rows), **Rings** (frames nested round the anchor; a low Step makes a tunnel, and Bands cuts each ring into strips) |
| Step | How far each copy moves on, from −100% to 300% |
| Slices | How many slices, 2 to 120. In Rings, how many rings |
| Bands | Cuts the other way. In Across and Down they only show with Stagger, Zigzag or Jitter, which make each band stutter its own way. In Both they're the rows; in Rings they cut each ring into strips that Stagger, Zigzag and Jitter work on |
| Reach | How far from the anchor the stutter goes. Past it the photo is left alone |
| Rhythm | **Even** slices, **Tight** (thin at the anchor, widening out), **Loose** (wide at the anchor, thinning out), **Random** widths |
| Falloff | **Hard** (full stutter inside Reach), **Fade** (strongest at the anchor), **Grow** (strongest at the edge of Reach) |
| Angle | Turns the slices round the anchor, from −90° to 90°, so the stutter runs on a slant. Not in Rings |
| Light | Lets the photo's brightness set the stutter: above 0 the light parts stutter and the dark parts stay put, below 0 the other way round |
| Sort | **Off**, **Dark First** or **Light First**: in each band the slices are reordered by how bright they show. At Step 100% that's a straight slice sort of the photo. In Rings, the innermost ring gets the darkest (or lightest) window |
| Feather | Softens the seams between anchors without blurring or fading anything: near a seam each slice takes its picture from a mix of the anchors' pulls, weighted by how near each is, so one anchor's stutter bends smoothly into the other's and every slice stays crisp. Feather sets how wide that blend zone is; even at 0 there's a narrow one, so anchors never meet in a hard line. With Falloff on Hard it also turns the cliff at the edge of Reach into a slope. In Rings there are no parts: every anchor's rings are drawn together, biggest first, so the tunnels overlap ring by ring |
| Bend | Above 0 copies hold near the anchor then race away; below 0 they spread fast then settle |
| Stagger | Shifts each band's anchor, so the stutter runs on a slant |
| Jitter | Throws every slice off by a random amount |
| Anchors | One to three anchors, each pulling its own stutter. The photo is split between them by which anchor is nearest, and dragging on the photo moves the nearest one |
| Flip | Mirrors every other copy, like fluted glass |
| Zigzag | Every other band runs backwards |
| Edge | What a slice shows past the photo's edge: **Stop** there, **Wrap** round, or **Reflect** back |
| Stack | Bakes the result in, so the same stutter runs again on top of itself. Stack a few times for stutters of stutters |
| Dice | Throws every setting at random |
| Grid, Anchor | Show the slice cuts and the anchors. Neither is ever saved. Small marks above and to the right of the photo always show where the cuts fall, and glide as they move |
| Download | Saves the picture at full size as a JPG |

Each slider drag, button press and anchor drag is one undo step. Reset goes back to the original photo and settings.

## Keys

| Key | Action |
|---|---|
| Drag / double-click on the photo | Move the anchor / back to the middle |
| Scroll (two fingers on a trackpad) | Move the view |
| Pinch, or Ctrl/Cmd + scroll | Zoom in and out round the pointer |
| Space + drag, middle-drag, two fingers on a touch screen | Move the view (two fingers also pinch to zoom) |
| 0 | Fit the photo to the window again |
| Arrows, Shift+arrows | Nudge the anchor you last dragged |
| 1, 2, 3 | How many anchors |
| D / Shift+D | Next / previous direction |
| [ ] | One less / one more slice |
| S | Stack |
| N | Dice |
| F, Z | Flip, zigzag |
| G (or L), A | Show or hide the grid, the anchors |
| E | Next edge |
| Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z | Undo, redo |
| Cmd/Ctrl+S | Download |
| U | Upload (or drop / paste an image anywhere) |
| H, Esc | Open the menu, close it |

## Files

- `index.html`: markup, the Menu tab and its sheet
- `style.css`: white page, flat grey controls with blue slider fills, red < > caps and a yellow Menu tab
- `app.js`: the stutter, history, drawing, input, saving
- `starter.jpg`: the photo it opens with
- `favicon.svg`, `og.jpg`: the tab icon and the 1200×630 share image. The share tags in `index.html` point at https://dinefining.github.io/stutwith/, so the repo needs to be called `stutwith` with GitHub Pages on

The starter photo is `starter.jpg`, next to the other files; if it's missing, a test card is used instead.

A [Maybe Machine](https://ravipopat.info/maybe-machines) by [Ravi Popat](https://ravipopat.info).
