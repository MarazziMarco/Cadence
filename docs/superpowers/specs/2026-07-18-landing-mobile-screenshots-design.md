# Landing Mobile Screenshots Design

## Goal

Replace the landing page's phone placeholders with real Cadence mobile screenshots while preserving the approved layout, animations, framing, and localization.

## Selection

- Hero phone: weekly calendar (`IMG_6130.PNG`).
- Mobile showcase row:
  1. clients (`IMG_6131.PNG`);
  2. voice appointment creation (`IMG_6133.PNG`);
  3. personalized scheduler settings (`IMG_6132.PNG`).
- Exclude the optimization loading screen (`IMG_6134.PNG`) because it shows a temporary state rather than a product capability.

The voice screen stays in the middle of the three-phone row. `PhoneRow` shows only its middle phone on narrow screens, making voice booking the mobile focal point; desktop shows all three screens.

## Asset Placement

Copy the selected screenshots into `public/landing` using stable, lowercase names:

- `mobile-calendar.png`
- `mobile-clients.png`
- `mobile-voice.png`
- `mobile-scheduler.png`

Landing code references them through root-relative `/landing/...` URLs. Keeping the files under `public/landing` ensures Next.js and Vercel include them in production builds.

## Integration

- Pass `/landing/mobile-calendar.png` to the existing hero `PhoneShowcase`.
- Pass clients, voice, and scheduler paths to the existing `PhoneRow`.
- Keep the current CSS phone frames and floating cards.
- Do not add another carousel, section, or interaction.
- Preserve the screenshots' original proportions and top alignment.

## Verification

- Add a landing integration test for the four selected image paths.
- Add the four assets to the public-asset end-to-end check.
- Run the landing tests and a production build.
- Verify the four files are present in the standalone production output.

