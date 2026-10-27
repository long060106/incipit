/**
 * The books behind "shake me up": books that overturn how a reader sees something (a society,
 * a history, power, science, themselves), as against books that comfort, inspire, grip or grieve.
 *
 * Darkness is not the test. The five mood axes cannot tell this apart from bleakness, so it is
 * kept here, by hand, from what readers and critics say of the books (October 2026):
 *
 * - Goodreads Listopia, readers' votes: "Books that Changed the Way You View Life" (6,335 voters),
 *   "Books That Changed My World" (3,525), "Thought Provoking" (2,037), "50 Books That Changed Me",
 *   "Powerful/influential books", "Books Containing Dangerous Ideas", "Dangerous Books – Fiction That
 *   Bites and Stings", "Life-Changing Nonfiction", "Books That Dared to Push the Envelope".
 * - BBC Culture, "The 100 stories that shaped the world" (2018): 108 critics and writers, 35 countries.
 * - Robert B. Downs, "Books That Changed the World"; The Guardian, "Ten books that changed the world" (2015).
 *
 * A book is here when at least two of these name it and what readers took from it is a belief
 * overturned. Well-loved books that readers found consoling or uplifting (The Alchemist, The Little
 * Prince), or gripping or sad (The Book Thief, The Road), are left out though the lists name them.
 */
export const JOLTS: ReadonlySet<string> = new Set([
  // Societies that could be ours
  'nineteen-eighty-four',
  'animal-farm',
  'brave-new-world',
  'fahrenheit-451',
  'the-handmaids-tale',
  'dune',
  'frankenstein',
  // What a history did to people, told from inside
  'uncle-toms-cabin',
  'narrative-of-the-life-of-frederick-douglass',
  'twelve-years-a-slave',
  'beloved',
  'to-kill-a-mockingbird',
  'heart-of-darkness',
  'the-jungle',
  'all-quiet-on-the-western-front',
  'the-sorrow-of-war',
  'the-sympathizer',
  // The ground pulled from under a life
  'the-stranger',
  'the-trial',
  'the-metamorphosis',
  'crime-and-punishment',
  'the-brothers-karamazov',
  'the-unbearable-lightness-of-being',
  'the-picture-of-dorian-gray',
  'the-catcher-in-the-rye',
  'candide',
  'life-of-pi',
  'the-hitchhikers-guide-to-the-galaxy',
  // Ideas that changed what people thought they knew
  'the-republic',
  'the-prince',
  'the-communist-manifesto',
  'on-the-origin-of-species',
  'silent-spring',
  'cosmos',
  'the-selfish-gene',
  'guns-germs-and-steel',
  'sapiens',
  'freakonomics',
  'the-immortal-life-of-henrietta-lacks',
]);
