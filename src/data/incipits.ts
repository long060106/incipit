/**
 * The opening line of seven books in the catalogue, one for each letter of the site's name.
 * All seven are in the public domain; each line is quoted from the Project Gutenberg edition
 * the book's download button points to.
 */
export const INCIPITS: { bookId: string; line: string }[] = [
  {
    bookId: 'pride-and-prejudice',
    line: 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife.',
  },
  { bookId: 'jane-eyre', line: 'There was no possibility of taking a walk that day.' },
  { bookId: 'mrs-dalloway', line: 'Mrs. Dalloway said she would buy the flowers herself.' },
  {
    bookId: 'the-metamorphosis',
    line: 'One morning, when Gregor Samsa woke from troubled dreams, he found himself transformed in his bed into a horrible vermin.',
  },
  {
    bookId: 'three-men-in-a-boat',
    line: 'There were four of us—George, and William Samuel Harris, and myself, and Montmorency.',
  },
  {
    bookId: 'meditations',
    line: 'Of my grandfather Verus I have learned to be gentle and meek, and to refrain from all anger and passion.',
  },
  {
    bookId: 'the-time-machine',
    line: 'The Time Traveller (for so it will be convenient to speak of him) was expounding a recondite matter to us.',
  },
];
