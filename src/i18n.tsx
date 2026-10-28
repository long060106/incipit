import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANGS, type BookL, type L, type Lang } from './data/types';
import { loadBookWords } from './lib/bookWords';

export const SITE_NAME = 'Incipit';

const STRINGS = {
  // Header
  index: { en: 'Index', fr: 'Index', ru: 'Указатель', vi: 'Mục lục' },
  menu: { en: 'Menu', fr: 'Menu', ru: 'Меню', vi: 'Menu' },
  navFirst: { en: 'First pages', fr: 'Premières pages', ru: 'Первые страницы', vi: 'Những trang đầu' },
  navDaily: { en: 'Daily line', fr: 'Ligne du jour', ru: 'Строка дня', vi: 'Câu văn mỗi ngày' },
  navGlobe: { en: 'Globe', fr: 'Globe', ru: 'Глобус', vi: 'Địa cầu' },
  navNotebook: { en: 'Notebook', fr: 'Carnet', ru: 'Блокнот', vi: 'Sổ tay' },
  navEssays: { en: 'Essays', fr: 'Essais', ru: 'Эссе', vi: 'Bài luận' },
  navAbout: { en: 'About', fr: 'À propos', ru: 'О сайте', vi: 'Giới thiệu' },
  navSignIn: { en: 'Sign in', fr: 'Connexion', ru: 'Войти', vi: 'Đăng nhập' },
  privacyLink: { en: 'Privacy', fr: 'Confidentialité', ru: 'Конфиденциальность', vi: 'Quyền riêng tư' },
  developedBy: { en: 'Developed by {name}', fr: 'Développé par {name}', ru: 'Разработчик: {name}', vi: 'Phát triển bởi {name}' },
  signInAdmin: { en: 'Sign in as admin', fr: 'Connexion administrateur', ru: 'Войти как администратор', vi: 'Đăng nhập quản trị' },
  readHere: { en: 'Read it here', fr: 'Lire ici', ru: 'Читать здесь', vi: 'Đọc tại đây' },
  readOn: { en: 'Continue reading', fr: 'Reprendre la lecture', ru: 'Продолжить чтение', vi: 'Đọc tiếp' },
  downloadShort: { en: 'Download', fr: 'Télécharger', ru: 'Скачать', vi: 'Tải về' },
  around: { en: 'Around the book', fr: 'Autour du livre', ru: 'Вокруг книги', vi: 'Quanh cuốn sách' },
  aroundNote: { en: 'Each line opens its Wikipedia article in a new tab: the book, its author, and the time and place it is set in.', fr: 'Chaque ligne ouvre son article Wikipédia dans un nouvel onglet : le livre, son auteur, l’époque et le lieu du récit.', ru: 'Каждая строка открывает статью Википедии в новой вкладке: о книге, её авторе, о времени и месте действия.', vi: 'Mỗi dòng mở bài Wikipedia tương ứng trong thẻ mới: cuốn sách, tác giả, thời gian và nơi chốn của câu chuyện.' },
  wikiBook: { en: 'The book', fr: 'Le livre', ru: 'Книга', vi: 'Cuốn sách' },
  wikiAuthor: { en: 'The author', fr: 'L’auteur', ru: 'Автор', vi: 'Tác giả' },
  wikiSetting: { en: 'The setting', fr: 'Le cadre', ru: 'Место действия', vi: 'Bối cảnh' },
  article: { en: 'Article', fr: 'Article', ru: 'Статья', vi: 'Bài viết' },
  switchToDay: { en: 'Switch to day mode', fr: 'Passer en mode jour', ru: 'Включить дневной режим', vi: 'Chuyển sang chế độ ngày' },
  switchToNight: { en: 'Switch to night mode', fr: 'Passer en mode nuit', ru: 'Включить ночной режим', vi: 'Chuyển sang chế độ đêm' },
  language: { en: 'Language', fr: 'Langue', ru: 'Язык', vi: 'Ngôn ngữ' },
  backToIntro: { en: 'Back to the introduction', fr: "Retour à l'introduction", ru: 'Вернуться к вступлению', vi: 'Quay lại phần mở đầu' },
  firstPage: { en: 'Home', fr: 'Accueil', ru: 'Главная', vi: 'Trang chủ' },

  // Intro
  defWord: { en: 'incipit', fr: 'incipit', ru: 'incipit', vi: 'incipit' },
  defClass: { en: 'noun', fr: 'nom masculin', ru: 'сущ., м. р.', vi: 'danh từ' },
  defMeaning: { en: 'The first words of a book.', fr: "Les premiers mots d'un livre.", ru: 'Первые слова книги.', vi: 'Những chữ đầu tiên của một cuốn sách.' },
  browse: { en: 'Browse the books', fr: 'Voir les livres', ru: 'Смотреть книги', vi: 'Xem sách' },
  scrollHint: { en: 'or scroll', fr: 'ou faites défiler', ru: 'или прокрутите', vi: 'hoặc cuộn xuống' },
  line1: { en: 'Most book sites ask what you want to read.', fr: 'La plupart des sites vous demandent ce que vous voulez lire.', ru: 'Большинство книжных сайтов спрашивают, что вы хотите прочитать.', vi: 'Phần lớn các trang sách hỏi bạn muốn đọc gì.' },
  line2: { en: 'This one asks how you want to feel.', fr: 'Celui-ci vous demande ce que vous voulez ressentir.', ru: 'Этот спрашивает, что вы хотите почувствовать.', vi: 'Trang này hỏi bạn muốn cảm thấy thế nào.' },
  line3: {
    en: 'Set the mood, and the books that fit step into the light.',
    fr: 'Réglez l’ambiance, et les livres qui vous vont entrent dans la lumière.',
    ru: 'Задайте настроение, и подходящие книги выйдут на свет.',
    vi: 'Chọn một tâm trạng, và những cuốn sách hợp với nó sẽ bước ra ánh sáng.',
  },
  line3sub: {
    en: 'The classics are free to download. The rest you can borrow.',
    fr: 'Les classiques se téléchargent gratuitement. Le reste s’emprunte.',
    ru: 'Классику можно скачать бесплатно. Остальное — взять почитать.',
    vi: 'Sách kinh điển được tải miễn phí. Phần còn lại bạn có thể mượn.',
  },

  // Panel
  panelTitle: { en: 'Find a book', fr: 'Trouver un livre', ru: 'Найти книгу', vi: 'Tìm sách' },
  searchLabel: { en: 'Search by title or author', fr: 'Chercher par titre ou auteur', ru: 'Искать по названию или автору', vi: 'Tìm theo tên sách hoặc tác giả' },
  searchPlaceholder: { en: 'Title or author', fr: 'Titre ou auteur', ru: 'Название или автор', vi: 'Tên sách hoặc tác giả' },
  askLabel: { en: 'Say in a few words what you would like to read', fr: 'Dites en quelques mots ce que vous aimeriez lire', ru: 'Скажите в нескольких словах, что бы вы хотели прочитать', vi: 'Nói vài chữ về điều bạn muốn đọc' },
  askPlaceholder: { en: 'Or in a few words: sad, short, set in Russia', fr: 'Ou en quelques mots : triste, court, en Russie', ru: 'Или в нескольких словах: грустная, короткая, в России', vi: 'Hoặc vài chữ: buồn, ngắn, ở Nga' },
  askGo: { en: 'Ask', fr: 'Demander', ru: 'Спросить', vi: 'Hỏi' },
  askBusy: { en: 'Reading your words…', fr: 'Lecture de vos mots…', ru: 'Читаю ваши слова…', vi: 'Đang đọc lời bạn…' },
  askUnderstood: { en: 'Understood: {note}', fr: 'Compris : {note}', ru: 'Понято: {note}', vi: 'Đã hiểu: {note}' },
  askNothing: { en: 'Nothing in those words to choose by. Try a mood, a theme or a place.', fr: 'Rien dans ces mots pour choisir. Essayez une humeur, un thème ou un lieu.', ru: 'В этих словах не за что зацепиться. Попробуйте настроение, тему или место.', vi: 'Những chữ này chưa đủ để chọn. Thử một tâm trạng, một chủ đề hay một nơi chốn.' },
  askTooMany: { en: 'That is all the asking for today. The filters below still work.', fr: 'C’est tout pour aujourd’hui. Les filtres ci-dessous fonctionnent toujours.', ru: 'На сегодня вопросов хватит. Фильтры ниже по-прежнему работают.', vi: 'Hôm nay hỏi đến đây thôi. Các bộ lọc bên dưới vẫn dùng được.' },
  askResting: { en: 'The words are resting until tomorrow. The filters below still work.', fr: 'Les mots se reposent jusqu’à demain. Les filtres ci-dessous fonctionnent toujours.', ru: 'Слова отдыхают до завтра. Фильтры ниже по-прежнему работают.', vi: 'Phần đọc chữ nghỉ đến mai. Các bộ lọc bên dưới vẫn dùng được.' },
  askFailed: { en: 'That did not go through. Try again in a moment.', fr: 'Cela n’a pas abouti. Réessayez dans un instant.', ru: 'Не получилось. Попробуйте ещё раз чуть позже.', vi: 'Chưa được. Thử lại sau giây lát.' },
  askCredit: {
    en: 'Read by an AI model: Google Gemini, or Llama at Cloudflare (Built with Llama). It only sets the filters; the books are this site’s. Do not type anything personal.',
    fr: 'Lu par un modèle d’IA : Google Gemini, ou Llama chez Cloudflare (Built with Llama). Il ne règle que les filtres ; les livres sont ceux du site. N’y tapez rien de personnel.',
    ru: 'Читает ИИ-модель: Google Gemini или Llama в Cloudflare (Built with Llama). Она только выставляет фильтры; книги — с этого сайта. Не пишите ничего личного.',
    vi: 'Do một mô hình AI đọc: Google Gemini, hoặc Llama tại Cloudflare (Built with Llama). Nó chỉ chỉnh bộ lọc; sách là của trang này. Đừng gõ điều gì riêng tư.',
  },
  mood: { en: 'Mood', fr: 'Ambiance', ru: 'Настроение', vi: 'Tâm trạng' },
  aBookTo: { en: 'A book to…', fr: 'Un livre pour…', ru: 'Книга, чтобы…', vi: 'Một cuốn sách để…' },
  teachMe: { en: 'teach me something', fr: 'm’apprendre quelque chose', ru: 'научить меня чему-то', vi: 'dạy tôi điều gì đó' },
  surpriseMe: { en: 'surprise me', fr: 'me surprendre', ru: 'удивить меня', vi: 'làm tôi bất ngờ' },
  fineTune: { en: 'Fine-tune', fr: 'Affiner', ru: 'Точнее', vi: 'Tinh chỉnh' },
  moodHint: { en: 'Move only the sliders you care about.', fr: 'Ne réglez que ce qui compte.', ru: 'Двигайте только те ползунки, что вам важны.', vi: 'Chỉ kéo những thanh bạn quan tâm.' },
  clear: { en: 'Clear', fr: 'Effacer', ru: 'Сбросить', vi: 'Xóa' },
  anywhere: { en: 'Any', fr: 'Indifférent', ru: 'Любой', vi: 'Bất kỳ' },
  themes: { en: 'Themes', fr: 'Thèmes', ru: 'Темы', vi: 'Chủ đề' },
  moreThemes: { en: 'More themes', fr: 'Plus de thèmes', ru: 'Больше тем', vi: 'Thêm chủ đề' },
  fewerThemes: { en: 'Fewer themes', fr: 'Moins de thèmes', ru: 'Меньше тем', vi: 'Bớt chủ đề' },
  genre: { en: 'Genre', fr: 'Genre', ru: 'Жанр', vi: 'Thể loại' },
  anyGenre: { en: 'Any genre', fr: 'Tous les genres', ru: 'Любой жанр', vi: 'Mọi thể loại' },
  length: { en: 'Length', fr: 'Longueur', ru: 'Объём', vi: 'Độ dài' },
  short: { en: 'Under 200 pages', fr: 'Moins de 200 pages', ru: 'До 200 страниц', vi: 'Dưới 200 trang' },
  medium: { en: '200 to 400', fr: '200 à 400', ru: 'От 200 до 400', vi: '200 đến 400' },
  long: { en: 'Over 400', fr: 'Plus de 400', ru: 'Больше 400', vi: 'Trên 400' },
  era: { en: 'Published', fr: 'Parution', ru: 'Издана', vi: 'Xuất bản' },
  pre1900: { en: 'Before 1900', fr: 'Avant 1900', ru: 'До 1900', vi: 'Trước 1900' },
  c20: { en: '1900 to 1999', fr: '1900 à 1999', ru: '1900–1999', vi: '1900 đến 1999' },
  c21: { en: '2000 on', fr: 'Depuis 2000', ru: 'С 2000', vi: 'Từ 2000' },
  readingLevel: { en: 'Reading level', fr: 'Niveau de lecture', ru: 'Сложность чтения', vi: 'Độ khó' },
  easy: { en: 'Easy', fr: 'Facile', ru: 'Легко', vi: 'Dễ' },
  moderate: { en: 'Moderate', fr: 'Moyen', ru: 'Средне', vi: 'Vừa phải' },
  demanding: { en: 'Demanding', fr: 'Exigeant', ru: 'Требует усилий', vi: 'Cần chú tâm' },
  rating: { en: 'Rating', fr: 'Note', ru: 'Оценка', vi: 'Điểm' },
  ratingAtLeast: { en: '{n} or higher', fr: '{n} ou plus', ru: '{n} и выше', vi: '{n} trở lên' },
  setting: { en: 'Set in', fr: 'Se passe en', ru: 'Место действия', vi: 'Lấy bối cảnh ở' },
  sortBy: { en: 'Show first', fr: 'Afficher d’abord', ru: 'Сначала', vi: 'Xếp trước' },
  sortRating: { en: 'Highest rated', fr: 'Les mieux notés', ru: 'С высокой оценкой', vi: 'Điểm cao nhất' },
  sortPopular: { en: 'Most read', fr: 'Les plus lus', ru: 'Самые читаемые', vi: 'Đọc nhiều nhất' },
  countryPlaceholder: { en: 'Anywhere. Type a country', fr: 'N’importe où. Tapez un pays', ru: 'Где угодно. Введите страну', vi: 'Bất cứ đâu. Gõ tên một nước' },
  clearCountry: { en: 'Clear the country', fr: 'Effacer le pays', ru: 'Убрать страну', vi: 'Xóa quốc gia' },
  noCountry: { en: 'No book is set there yet.', fr: 'Aucun livre ne s’y passe pour l’instant.', ru: 'Там пока не происходит ни одна книга.', vi: 'Chưa có cuốn sách nào lấy bối cảnh ở đó.' },
  freeOnly: { en: 'Free to download only', fr: 'Téléchargement gratuit uniquement', ru: 'Только бесплатные для скачивания', vi: 'Chỉ sách tải miễn phí' },
  reset: { en: 'Clear all', fr: 'Tout effacer', ru: 'Сбросить всё', vi: 'Xóa hết' },
  showBooks: { en: 'Show the books', fr: 'Voir les livres', ru: 'Показать книги', vi: 'Xem sách' },
  openFilters: { en: 'Mood and filters', fr: 'Ambiance et filtres', ru: 'Настроение и фильтры', vi: 'Tâm trạng và bộ lọc' },

  // Results
  countAll: { en: '{n} books', fr: '{n} livres', ru: 'Книг: {n}', vi: '{n} cuốn' },
  countFit: { en: '{n} fit', fr: '{n} correspondent', ru: 'Подходят: {n}', vi: '{n} cuốn hợp' },
  countFitOne: { en: '1 fits', fr: '1 correspond', ru: 'Подходит 1', vi: '1 cuốn hợp' },
  countNone: { en: 'None fit', fr: 'Aucun', ru: 'Ни одна не подходит', vi: 'Không cuốn nào hợp' },
  closest: { en: 'Nothing matches exactly. Closest {n}:', fr: 'Aucun ne correspond exactement. Les {n} plus proches :', ru: 'Точных совпадений нет. Ближайшие ({n}):', vi: 'Không có cuốn nào khớp hẳn. {n} cuốn gần nhất:' },
  noneTitle: { en: 'No book fits all of that.', fr: 'Aucun livre ne réunit tout cela.', ru: 'Ни одна книга не подходит под всё это сразу.', vi: 'Không cuốn sách nào hợp với tất cả những điều đó.' },
  noneBody: { en: 'Loosen a filter, or clear them and start again.', fr: 'Relâchez un filtre, ou effacez tout et recommencez.', ru: 'Ослабьте какой-нибудь фильтр или сбросьте всё и начните заново.', vi: 'Nới một bộ lọc, hoặc xóa hết và bắt đầu lại.' },
  wallGuide: { en: 'Drag or scroll in any direction', fr: 'Faites glisser ou défiler dans tous les sens', ru: 'Тяните или прокручивайте в любую сторону', vi: 'Kéo hoặc cuộn theo hướng nào cũng được' },
  wallGuideNote: { en: 'Up, down, left, right: the wall has no edge.', fr: 'Haut, bas, gauche, droite : le mur n’a pas de bord.', ru: 'Вверх, вниз, влево, вправо: у стены нет края.', vi: 'Lên, xuống, trái, phải: bức tường không có mép.' },
  dragHint: { en: 'Drag or scroll to wander', fr: 'Faites glisser ou défiler pour flâner', ru: 'Тяните или прокручивайте, чтобы бродить', vi: 'Kéo hoặc cuộn để dạo quanh' },
  trayMove: { en: 'Drag to move. Double-click to put it back.', fr: 'Glissez pour déplacer. Double-cliquez pour le remettre en place.', ru: 'Тяните, чтобы сдвинуть. Двойной щелчок вернёт на место.', vi: 'Kéo để di chuyển. Nhấp đúp để đặt lại chỗ cũ.' },
  trayGrow: { en: 'Larger, with titles', fr: 'Plus grand, avec les titres', ru: 'Крупнее, с названиями', vi: 'Lớn hơn, có tên sách' },
  trayShrink: { en: 'Back to one row', fr: 'Revenir à une rangée', ru: 'Вернуться к одному ряду', vi: 'Trở lại một hàng' },
  trayHide: { en: 'Hide the books', fr: 'Masquer les livres', ru: 'Скрыть книги', vi: 'Ẩn sách' },
  trayShow: { en: 'Show the books', fr: 'Afficher les livres', ru: 'Показать книги', vi: 'Xem sách' },
  zoomOut: { en: 'Stand back: see more covers', fr: 'Prendre du recul : voir plus de couvertures', ru: 'Отойти: больше обложек', vi: 'Lùi lại: xem nhiều bìa hơn' },
  zoomIn: { en: 'Step closer', fr: 'Se rapprocher', ru: 'Подойти ближе', vi: 'Lại gần hơn' },
  lampOn: { en: 'Light the lamp', fr: 'Allumer la lampe', ru: 'Зажечь лампу', vi: 'Thắp đèn' },
  lampOff: { en: 'Put the lamp out', fr: 'Éteindre la lampe', ru: 'Погасить лампу', vi: 'Tắt đèn' },

  // Book sheet
  close: { en: 'Close', fr: 'Fermer', ru: 'Закрыть', vi: 'Đóng' },
  by: { en: 'by {author}', fr: 'de {author}', ru: '{author}', vi: 'của {author}' },
  readIf: { en: 'Read it if', fr: 'Lisez-le si', ru: 'Читайте, если', vi: 'Hãy đọc nếu' },
  skipIf: { en: 'Skip it if', fr: 'Passez votre chemin si', ru: 'Пропустите, если', vi: 'Bỏ qua nếu' },
  publicDomain: {
    en: 'In the public domain, so it is free to keep.',
    fr: 'Dans le domaine public : vous pouvez le garder gratuitement.',
    ru: 'В общественном достоянии — её можно оставить себе бесплатно.',
    vi: 'Thuộc phạm vi công cộng, nên bạn được giữ miễn phí.',
  },
  inCopyright: {
    en: 'Still in copyright, so there is no free download. A library loan costs nothing.',
    fr: 'Encore sous droits : pas de téléchargement gratuit. Un prêt en bibliothèque ne coûte rien.',
    ru: 'Ещё под авторским правом, поэтому бесплатно скачать нельзя. В библиотеке её можно взять даром.',
    vi: 'Vẫn còn bản quyền nên không có bản tải miễn phí. Mượn ở thư viện thì không mất gì.',
  },
  downloadBook: { en: 'Download the book', fr: 'Télécharger le livre', ru: 'Скачать книгу', vi: 'Tải sách về' },
  downloadNote: {
    en: 'PDF, {size}. Out of copyright, so it is yours to keep.',
    fr: 'PDF, {size}. Libre de droits : il est à vous.',
    ru: 'PDF, {size}. Авторское право истекло, так что книга ваша.',
    vi: 'PDF, {size}. Đã hết bản quyền, nên sách là của bạn.',
  },
  megabytes: { en: 'MB', fr: 'Mo', ru: 'МБ', vi: 'MB' },
  kilobytes: { en: 'kB', fr: 'ko', ru: 'КБ', vi: 'kB' },
  pdfHelp: {
    en: 'The PDF opens on any computer, phone or tablet. For an e-reader, take the e-reader files instead.',
    fr: 'Le PDF s’ouvre sur tout ordinateur, téléphone ou tablette. Pour une liseuse, prenez plutôt les fichiers pour liseuse.',
    ru: 'PDF открывается на любом компьютере, телефоне или планшете. Для электронной книги возьмите файлы для ридеров.',
    vi: 'Bản PDF mở được trên mọi máy tính, điện thoại hay máy tính bảng. Với máy đọc sách, hãy lấy các tệp dành cho máy đọc sách.',
  },
  ereaderFiles: { en: 'Files for e-readers, EPUB and Kindle', fr: 'Fichiers pour liseuse, EPUB et Kindle', ru: 'Файлы для ридеров, EPUB и Kindle', vi: 'Tệp cho máy đọc sách, EPUB và Kindle' },
  audiobook: { en: 'Free audiobook (LibriVox)', fr: 'Livre audio gratuit (LibriVox)', ru: 'Бесплатная аудиокнига (LibriVox)', vi: 'Sách nói miễn phí (LibriVox)' },
  borrowOnline: { en: 'Borrow it online', fr: 'L’emprunter en ligne', ru: 'Взять почитать онлайн', vi: 'Mượn trực tuyến' },
  borrowNote: {
    en: 'The Internet Archive lends this copy free, with an account.',
    fr: 'Internet Archive prête cet exemplaire gratuitement, avec un compte.',
    ru: 'Internet Archive даёт этот экземпляр бесплатно, нужен аккаунт.',
    vi: 'Internet Archive cho mượn bản này miễn phí, cần có tài khoản.',
  },
  findLibraryShort: { en: 'Find it in a library', fr: 'Le trouver en bibliothèque', ru: 'Найти в библиотеке', vi: 'Tìm ở thư viện' },
  libraryNote: {
    en: 'Still in copyright, so no free download exists. A library loan costs nothing.',
    fr: 'Encore sous droits : aucun téléchargement gratuit n’existe. Un prêt en bibliothèque ne coûte rien.',
    ru: 'Ещё под авторским правом, поэтому бесплатной версии нет. В библиотеке её можно взять даром.',
    vi: 'Vẫn còn bản quyền nên không có bản miễn phí. Mượn ở thư viện thì không mất gì.',
  },
  translationNote: {
    en: 'The English translation is still in copyright. The original text is free to read.',
    fr: 'La traduction anglaise est encore sous droits. Le texte original est en accès libre.',
    ru: 'Английский перевод ещё под авторским правом. Оригинальный текст можно читать бесплатно.',
    vi: 'Bản dịch tiếng Anh vẫn còn bản quyền. Nguyên bản thì đọc miễn phí được.',
  },
  libby: {
    en: 'Borrow the ebook or audiobook through your library (Libby)',
    fr: 'Emprunter l’ebook ou le livre audio via votre bibliothèque (Libby)',
    ru: 'Взять электронную или аудиокнигу через свою библиотеку (Libby)',
    vi: 'Mượn sách điện tử hoặc sách nói qua thư viện của bạn (Libby)',
  },
  yearBC: { en: 'c. {year} BC', fr: 'v. {year} av. J.-C.', ru: 'ок. {year} до н. э.', vi: 'khoảng năm {year} TCN' },
  fromGutenberg: { en: 'Project Gutenberg', fr: 'Projet Gutenberg', ru: 'Project Gutenberg', vi: 'Project Gutenberg' },
  readOnline: { en: 'Read online', fr: 'Lire en ligne', ru: 'Читать онлайн', vi: 'Đọc trực tuyến' },
  findLibrary: { en: 'Find it in a library near you', fr: 'Le trouver dans une bibliothèque près de chez vous', ru: 'Найти в библиотеке рядом', vi: 'Tìm ở thư viện gần bạn' },
  buyCopy: { en: 'Buy a copy', fr: 'Acheter un exemplaire', ru: 'Купить экземпляр', vi: 'Mua một bản' },
  details: { en: 'Details', fr: 'Fiche', ru: 'Сведения', vi: 'Thông tin' },
  aroundShort: { en: 'c. {year}', fr: 'v. {year}', ru: 'ок. {year}', vi: 'khoảng {year}' },
  pagesLabel: { en: 'pages', fr: 'pages', ru: 'страниц', vi: 'trang' },
  publishedLabel: { en: 'first published', fr: 'première parution', ru: 'первое издание', vi: 'xuất bản lần đầu' },
  levelIs: { en: 'Reading level: {level}', fr: 'Niveau de lecture : {level}', ru: 'Сложность: {level}', vi: 'Độ khó: {level}' },
  writtenIn: { en: 'Written in', fr: 'Écrit en', ru: 'Язык оригинала', vi: 'Ngôn ngữ gốc' },
  ratingCount: { en: '{n} ratings on Open Library', fr: '{n} notes sur Open Library', ru: 'Оценок на Open Library: {n}', vi: '{n} lượt chấm trên Open Library' },
  ratingCountBoth: { en: '{n} ratings on Open Library and here', fr: '{n} notes sur Open Library et ici', ru: 'Оценок на Open Library и здесь: {n}', vi: '{n} lượt chấm trên Open Library và ở đây' },
  moodByReaders: { en: 'Moved by how it felt to {n} readers here.', fr: 'Ajustée selon le ressenti de {n} lecteurs ici.', ru: 'Уточнено по ощущениям читателей здесь: {n}.', vi: 'Được điều chỉnh theo cảm nhận của {n} bạn đọc ở đây.' },
  moodByOne: { en: 'Moved by how it felt to one reader here.', fr: 'Ajustée selon le ressenti d’un lecteur ici.', ru: 'Уточнено по ощущениям одного читателя здесь.', vi: 'Được điều chỉnh theo cảm nhận của một bạn đọc ở đây.' },
  tooFewRatings: { en: 'Too few ratings on Open Library', fr: 'Trop peu de notes sur Open Library', ru: 'Слишком мало оценок на Open Library', vi: 'Quá ít lượt chấm trên Open Library' },
  moodOfBook: { en: 'Mood', fr: 'Ambiance', ru: 'Настроение', vi: 'Tâm trạng' },
  useThisMood: { en: 'Find books with this mood', fr: 'Trouver des livres dans cette ambiance', ru: 'Найти книги с таким настроением', vi: 'Tìm sách cùng tâm trạng này' },
  likeItBut: { en: 'Or one like it, but', fr: 'Ou un livre proche, mais', ru: 'Или похожую, но', vi: 'Hoặc một cuốn tương tự, nhưng' },
  lighter: { en: 'lighter', fr: 'plus léger', ru: 'светлее', vi: 'nhẹ hơn' },
  darker: { en: 'darker', fr: 'plus sombre', ru: 'мрачнее', vi: 'tối hơn' },
  stranger: { en: 'stranger', fr: 'plus étrange', ru: 'страннее', vi: 'lạ hơn' },
  shorter: { en: 'shorter', fr: 'plus court', ru: 'короче', vi: 'ngắn hơn' },
  beforeYouRead: { en: 'Before you read', fr: 'Avant de lire', ru: 'Перед чтением', vi: 'Trước khi đọc' },
  pace: { en: 'Pace', fr: 'Rythme', ru: 'Темп', vi: 'Nhịp truyện' },
  headsUp: { en: 'Heads-up', fr: 'À savoir', ru: 'Имейте в виду', vi: 'Lưu ý' },
  reviews: { en: 'Reviews', fr: 'Critiques', ru: 'Рецензии', vi: 'Bài điểm sách' },
  otherWays: { en: 'Other ways to get it', fr: 'Autres façons de l’obtenir', ru: 'Где ещё её взять', vi: 'Những cách khác để có sách' },
  reviewsOn: { en: 'Reader reviews on {site}', fr: 'Avis de lecteurs sur {site}', ru: 'Отзывы читателей на {site}', vi: 'Cảm nhận của bạn đọc trên {site}' },
  similar: { en: 'Similar in mood', fr: 'Dans la même ambiance', ru: 'Похожие по настроению', vi: 'Cùng tâm trạng' },
  opensNewTab: { en: 'opens in a new tab', fr: 'ouvre un nouvel onglet', ru: 'откроется в новой вкладке', vi: 'mở trong thẻ mới' },

  // Index
  indexTitle: { en: 'Index', fr: 'Index', ru: 'Указатель', vi: 'Mục lục' },
  indexIntro: { en: 'Every book on the wall, in alphabetical order.', fr: 'Tous les livres du mur, par ordre alphabétique.', ru: 'Все книги со стены по алфавиту.', vi: 'Mọi cuốn sách trên tường, theo thứ tự chữ cái.' },
  aboutTitle: { en: 'About', fr: 'À propos', ru: 'О сайте', vi: 'Giới thiệu' },
  aboutBody: {
    en: 'Incipit helps you choose a book by mood, then get it legally. Books that are out of copyright can be downloaded here as PDFs, made from the Standard Ebooks and Project Gutenberg editions and kept on this site. Their audiobooks are LibriVox recordings. Books still in copyright are never offered for download: they link to lenders, libraries and bookshops. Covers and ratings come from Open Library. Mood scores and reading advice are editorial.',
    fr: 'Incipit vous aide à choisir un livre selon votre humeur, puis à l’obtenir légalement. Les livres libres de droits se téléchargent ici en PDF, réalisés à partir des éditions de Standard Ebooks et du Projet Gutenberg et conservés sur ce site. Leurs livres audio sont des enregistrements LibriVox. Les livres encore sous droits ne sont jamais proposés en téléchargement : ils renvoient vers des prêteurs, des bibliothèques et des librairies. Les couvertures et les notes viennent d’Open Library. Les ambiances et les conseils de lecture sont rédigés par nos soins.',
    ru: 'Incipit помогает выбрать книгу по настроению, а потом получить её законно. Книги, авторское право на которые истекло, можно скачать здесь в PDF: они сделаны из изданий Standard Ebooks и Project Gutenberg и хранятся на этом сайте. Их аудиокниги — записи LibriVox. Книги, ещё защищённые авторским правом, никогда не предлагаются для скачивания: они ведут к сервисам выдачи, библиотекам и книжным магазинам. Обложки и оценки взяты с Open Library. Оценки настроения и советы по чтению — редакционные.',
    vi: 'Incipit giúp bạn chọn sách theo tâm trạng, rồi có được sách một cách hợp pháp. Những cuốn đã hết bản quyền có thể tải về ở đây dưới dạng PDF, làm từ các ấn bản của Standard Ebooks và Project Gutenberg và lưu trên trang này. Sách nói của chúng là các bản thu của LibriVox. Sách còn bản quyền không bao giờ có bản tải về: chúng dẫn tới nơi cho mượn, thư viện và hiệu sách. Bìa và điểm lấy từ Open Library. Điểm tâm trạng và lời khuyên đọc do trang tự viết.',
  },
} satisfies Record<string, L>;

export type StringKey = keyof typeof STRINGS;

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Interface string, with `{name}` placeholders filled from `vars`. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  /** Picks the current language out of a localized value, or the English when it has none. */
  tl: (value: BookL) => string;
}

const I18nContext = createContext<I18n | null>(null);

/** The language public/boot/theme.js chose before the page was drawn. */
export function initialLang(): Lang {
  const lang = document.documentElement.lang as Lang;
  return LANGS.includes(lang) ? lang : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    // The books' words in that language come first, so the page changes language all at once.
    void loadBookWords(next).then(() => setLangState(next));
    try {
      localStorage.setItem('incipit:lang', next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this visit only.
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => {
        let text: string = STRINGS[key][lang];
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replace(`{${name}}`, String(replacement));
          }
        }
        return text;
      },
      tl: (localized) => localized[lang] ?? localized.en,
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
