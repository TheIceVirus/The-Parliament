# BRIAR CHRONICLES (version 3): How to use your site

This is your art site. You can add and arrange your art, pick frames, change the layout, fonts and words, and update your links, all without touching any code.

---

## ⚠ First: delete the old copy

If you ever ran an older BRIAR CHRONICLES, the old one can keep running in the background and make it look like nothing changed.

1. **Close every black BRIAR CHRONICLES window.** Not sure? Restart your computer.
2. **Keeping art you uploaded to the old copy?** Copy the `data` folder from the OLD folder into this new folder, next to `server.py`. If you never uploaded anything, skip this.
3. **Delete the old BRIAR CHRONICLES folder and the old zip.**
4. **Only use this folder, "BRIAR CHRONICLES v3", from now on.**

**How to tell you have the new one:** "version 3" shows in three places:
- the black window ("BRIAR CHRONICLES (version 3) is open")
- the very bottom of the website
- your dashboard, under your name

If it's missing, an old copy is still running. Close all the black windows and start again. The new version also warns you by itself.

---

## 1. Start the site

1. Make sure the zip is **extracted**: right-click it and choose **Extract All**. Don't run it from inside the zip window.
2. **Windows:** double-click **`START BRIAR CHRONICLES.bat`**. **Mac:** double-click **`START BRIAR CHRONICLES.command`** (the first time, right-click it and choose **Open**).
3. Your browser opens the site. Leave the black window open while you use it, and close it when you're done.

The site needs **Python**, which is free. If the black window says Python is missing:
1. Install it from <https://www.python.org/downloads/>.
2. On Windows, tick **"Add python.exe to PATH"** during setup.
3. Start the site again.

---

## 2. Sign in

Scroll to the very bottom of any page and click **✠ The keeper's door**. You can also go straight to `/admin`.

> **Your password is `sutrah`.**
> Change it any time under **Profile & links**.

You'll land on **Upload artwork**.

---

## 3. Add your art

### One piece at a time (with details)
1. Drop an image into the big box, or click it to choose a file. PNG, JPEG, WebP and GIF all work, up to 30 MB.
2. Give it a title. The rest is optional: year, category, tags (separated by commas), a description, links, and which collections it belongs to.
3. Under **Presentation**, choose:
   - its **frame**
   - its **background**
   - a **mat** (space around the art)
   - its **size** in the grid
   - its **entrance animation**
   - whether its **title** shows on the card
   
   The preview on the right shows exactly how it will look.
4. Click **Publish**. If you're not ready to show it, click **Save as draft** instead.

### Lots of pieces at once
Go to **My artworks**, click **+ Quick upload several**, and select all your images. They go up right away, titled from their file names. Click **Edit** on any of them later to add details.

---

## 4. Frames and layout

Open **Layout & frames**.

- **Gallery layout:** Masonry, Grid, or Full screen (one at a time). You can also set the number of columns and the space between pieces.
- **Frames:** every frame is shown on your own art. The choices are:
  - Antique silver
  - Gothic corners
  - Gilded
  - Reliquary gold with gems
  - Cathedral arch window
  - Briar and roses
  - Stained glass
  - Candlelight glow
  - Wrought iron
  - Crimson glow
  - Thin line
  - No frame
  
  Pick one, then click **Use for new uploads** or **Put this frame on every piece**.
- **Mats and titles:** change the mat or the title style on every piece at once.
- **Framing just one piece:** open **My artworks**, click **Edit** on it, and choose under **Presentation**.
- **Moving pieces around:** in **My artworks**, drag the **⋮⋮** handle (or use the ↑ ↓ buttons). The gallery shows pieces in that order.

---

## 5. Everything else

| Where | What it does |
|---|---|
| **My artworks** | Reorder, **★** to put a piece in *The Relics*, **Publish / Unpublish**, **Edit**, **Delete**. |
| **Collections** | Group pieces by theme. Click the thumbnails to add or remove pieces, then pick a cover. |
| **Journal** | Write posts for visitors. Leave a blank line between paragraphs. |
| **Tags & categories** | Rename or remove a tag or category on every piece at once. |
| **Profile & links** | Your name, your About text, your Twitch profile picture, your links and your password. |
| **Fonts & text** | Choose fonts (you see each one before picking it), plus the site title, tagline, entrance words and menu names. |

Click **Preview site** (bottom left) to see the real site, drafts included, before anyone else does. And there's a little **✦ Birthday note** link at the bottom left.

---

## 6. Your files and backups

Everything you upload is saved in the **`data`** folder inside this folder.

- **To back up:** copy the `data` folder somewhere safe.
- **New version in the future:**
  1. Close the black window.
  2. Copy your `data` folder into the new folder.
  3. Delete the old folder.
  4. Start the new one.
  
  New art that comes with an update appears on its own, and anything you deleted stays deleted.
- **Forgot your password?** Ask SheDithers to reset it. Or open a terminal in this folder and run `python server.py --set-password`.
