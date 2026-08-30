/* ============================================================
   Vitality — muscle group glyph library
   viewBox 0 0 100 100 · stroke #6EE7B7 ~3 · round caps/joins
   .ms = muscle silhouette (mint fill)   .ln = divider (no fill)
   Each glyph is anatomy cropped tight to the muscle belly —
   the shape a trainer sketches on a whiteboard, not a body.
   ============================================================ */
window.VITALITY_MUSCLES = [
  {
    key: 'chest', name: 'Chest', latin: 'Pectoralis major',
    // two pec fans — broad along the sternum, converging laterally to the shoulder
    svg: `
      <path class="ms" d="M48 30 L48 61 C38 60 27 55 19 46 C25 37 36 31 48 30 Z"/>
      <path class="ms" d="M52 30 L52 61 C62 60 73 55 81 46 C75 37 64 31 52 30 Z"/>
    `
  },
  {
    key: 'back', name: 'Back', latin: 'Latissimus dorsi',
    // the V-sweep: wide under the arms, tapering to the waist
    svg: `
      <path class="ms" d="M24 32 C28 50 36 64 47 78 L53 78 C64 64 72 50 76 32 C66 38 58 40 50 40 C42 40 34 38 24 32 Z"/>
      <path class="ln" d="M50 40 L50 78"/>
      <path class="ln" d="M33 36 C37 52 42 64 48 76"/>
      <path class="ln" d="M67 36 C63 52 58 64 52 76"/>
    `
  },
  {
    key: 'shoulders', name: 'Shoulders', latin: 'Deltoid',
    // rounded three-headed cap
    svg: `
      <path class="ms" d="M28 64 C26 40 40 27 50 27 C60 27 74 40 72 64 C61 69 39 69 28 64 Z"/>
      <path class="ln" d="M43 29 C39 44 38 56 37 65"/>
      <path class="ln" d="M57 29 C61 44 62 56 63 65"/>
    `
  },
  {
    key: 'biceps', name: 'Biceps', latin: 'Biceps brachii',
    // two heads (long + short) notching at the top, converging to one tendon
    svg: `
      <path class="ms" d="M50 27 C45 22 39 23 39 31 C33 42 35 53 43 64 C46 70 48 74 50 80 C52 74 54 70 57 64 C65 53 67 42 61 31 C61 23 55 22 50 27 Z"/>
      <path class="ln" d="M50 30 L50 78"/>
    `
  },
  {
    key: 'triceps', name: 'Triceps', latin: 'Triceps brachii',
    // the horseshoe — outer arc + inner arc, three heads
    svg: `
      <path class="ms" d="M30 76 C25 44 36 24 50 24 C64 24 75 44 70 76 L60 76 C64 48 60 38 50 38 C40 38 36 48 40 76 Z"/>
      <path class="ln" d="M50 24 L50 38"/>
    `
  },
  {
    key: 'quads', name: 'Quads', latin: 'Quadriceps femoris',
    // three heads from hip, converging at the knee
    svg: `
      <path class="ms" d="M30 26 C24 48 34 70 44 82 L56 82 C66 70 76 48 70 26 C62 31 54 33 50 33 C46 33 38 31 30 26 Z"/>
      <path class="ln" d="M50 33 L50 80"/>
      <path class="ln" d="M40 30 C40 50 43 68 47 80"/>
      <path class="ln" d="M60 30 C60 50 57 68 53 80"/>
    `
  },
  {
    key: 'hamstrings', name: 'Hamstrings', latin: 'Biceps femoris',
    // two parallel bellies down the back of the thigh
    svg: `
      <path class="ms" d="M44 22 C34 30 34 56 40 80 C43 82 46 82 48 80 C50 56 49 32 48 22 C47 21 45 21 44 22 Z"/>
      <path class="ms" d="M56 22 C66 30 66 56 60 80 C57 82 54 82 52 80 C50 56 51 32 52 22 C53 21 55 21 56 22 Z"/>
    `
  },
  {
    key: 'glutes', name: 'Glutes', latin: 'Gluteus maximus',
    // two rounded hemispheres with a center cleft
    svg: `
      <path class="ms" d="M49 36 C41 28 24 28 19 42 C15 54 22 70 35 71 C44 72 49 64 49 54 Z"/>
      <path class="ms" d="M51 36 C59 28 76 28 81 42 C85 54 78 70 65 71 C56 72 51 64 51 54 Z"/>
      <path class="ln" d="M50 34 L50 66"/>
    `
  },
  {
    key: 'calves', name: 'Calves', latin: 'Gastrocnemius',
    // two gastroc bellies bulging wide, tapering to a thin achilles
    svg: `
      <path class="ms" d="M50 22 C36 26 29 39 34 51 C37 59 45 65 49 82 L51 82 C55 65 63 59 66 51 C71 39 64 26 50 22 Z"/>
      <path class="ln" d="M50 25 C46 38 47 52 49 80"/>
      <path class="ln" d="M50 25 C54 38 53 52 51 80"/>
    `
  },
  {
    key: 'core', name: 'Core', latin: 'Rectus abdominis',
    // the six-pack with the linea alba
    svg: `
      <path class="ms" d="M35 26 C35 24 37 23 40 23 L60 23 C63 23 65 24 65 26 C66 46 65 64 60 76 C58 79 42 79 40 76 C35 64 34 46 35 26 Z"/>
      <path class="ln" d="M50 24 L50 77"/>
      <path class="ln" d="M36 41 L64 41"/>
      <path class="ln" d="M37 58 L63 58"/>
    `
  },
  {
    key: 'traps', name: 'Traps', latin: 'Trapezius',
    // kite from the base of the skull, wide at the shoulders, to T12
    svg: `
      <path class="ms" d="M50 20 C44 28 33 36 24 41 C34 50 43 64 50 82 C57 64 66 50 76 41 C67 36 56 28 50 20 Z"/>
      <path class="ln" d="M50 24 L50 78"/>
      <path class="ln" d="M30 42 C40 44 60 44 70 42"/>
    `
  },
  {
    key: 'forearms', name: 'Forearms', latin: 'Brachioradialis',
    // brachioradialis bulge at the elbow tapering to the wrist
    svg: `
      <path class="ms" d="M38 24 C30 30 30 44 35 52 C42 62 48 70 52 80 L58 79 C61 64 60 46 56 32 C54 26 50 22 46 22 C43 22 40 23 38 24 Z"/>
      <path class="ln" d="M40 28 C38 42 42 58 52 78"/>
    `
  }
];
