import type { ReactNode } from 'react';
import type { L } from '../data/types';
import { useI18n } from '../i18n';
import { PageHeader, pageUrl, useQuickLoader } from './PageHeader';
import './legal.css';

/*
  The privacy policy (/privacy) and the terms (/terms): what the site keeps, who else handles it,
  how to have it erased, and what is asked of those who write here. They say what worker/index.ts
  and the pages really do; when one changes, so must the other. Plain words, not legal advice.
*/

const CONTACT = 'incipit.library.co@gmail.com';
const UPDATED: L = { en: '17 October 2026', fr: '17 octobre 2026', ru: '17 октября 2026', vi: '17 tháng 10 năm 2026' };

interface Part {
  title: L;
  body?: L[];
  items?: L[];
  after?: L[];
}

interface Doc {
  title: L;
  lead: L;
  parts: Part[];
}

const TEXT = {
  eyebrow: { en: 'The small print', fr: 'Les petits caractères', ru: 'Мелкий шрифт', vi: 'Những điều khoản nhỏ' },
  updated: { en: 'Last updated', fr: 'Dernière mise à jour', ru: 'Последнее обновление', vi: 'Cập nhật lần cuối' },
  privacy: { en: 'Privacy policy', fr: 'Politique de confidentialité', ru: 'Политика конфиденциальности', vi: 'Chính sách quyền riêng tư' },
  terms: { en: 'Terms of use', fr: 'Conditions d’utilisation', ru: 'Условия использования', vi: 'Điều khoản sử dụng' },
  contact: { en: 'Write to', fr: 'Écrire à', ru: 'Писать на', vi: 'Viết thư tới' },
} satisfies Record<string, L>;

const PRIVACY: Doc = {
  title: TEXT.privacy,
  lead: {
    en: 'Incipit is a small personal website for finding books by mood and reading the ones that are out of copyright. It shows no advertising, runs no analytics and sets no tracking cookies. This page says what it keeps about you, who else handles it, and how to have it erased.',
    fr: 'Incipit est un petit site personnel pour trouver des livres selon l’humeur et lire ceux qui sont dans le domaine public. Il n’affiche aucune publicité, n’utilise aucun outil d’analyse et ne dépose aucun cookie de suivi. Cette page dit ce qu’il garde sur vous, qui d’autre y a accès, et comment tout faire effacer.',
    ru: 'Incipit — небольшой личный сайт, где книги ищут по настроению и читают те, что вышли из-под авторского права. Здесь нет рекламы, аналитики и следящих cookie. На этой странице сказано, что сайт хранит о вас, кто ещё с этим работает и как всё это стереть.',
    vi: 'Incipit là một trang web cá nhân nhỏ để tìm sách theo tâm trạng và đọc những cuốn đã hết bản quyền. Trang không có quảng cáo, không chạy công cụ phân tích và không đặt cookie theo dõi. Trang này nói rõ trang lưu gì về bạn, ai khác xử lý những thông tin đó, và cách xóa chúng.',
  },
  parts: [
    {
      title: { en: 'What stays on your device', fr: 'Ce qui reste sur votre appareil', ru: 'Что остаётся на вашем устройстве', vi: 'Những gì nằm trên thiết bị của bạn' },
      body: [
        {
          en: 'Your notebook (the passages you mark, your notes, the places and bookmarks), the theme and language you chose, and your library card are kept in your browser’s own storage. The site sets no cookies.',
          fr: 'Votre carnet (les passages marqués, vos notes, les lieux et les signets), le thème et la langue choisis, et votre carte de lecteur sont gardés dans le stockage de votre navigateur. Le site ne dépose aucun cookie.',
          ru: 'Ваш блокнот (отмеченные отрывки, заметки, места и закладки), выбранные вами тема и язык и ваш читательский билет хранятся в собственном хранилище браузера. Сайт не ставит cookie.',
          vi: 'Sổ tay của bạn (những đoạn bạn đánh dấu, ghi chú, vị trí đang đọc và dấu trang), giao diện và ngôn ngữ bạn chọn, cùng thẻ thư viện của bạn được lưu trong bộ nhớ riêng của trình duyệt. Trang không đặt cookie nào.',
        },
      ],
    },
    {
      title: { en: 'What is kept on the server, only if you ask for it', fr: 'Ce qui est gardé sur le serveur, seulement si vous le demandez', ru: 'Что хранится на сервере — только если вы сами этого захотите', vi: 'Những gì lưu trên máy chủ, chỉ khi bạn yêu cầu' },
      body: [
        {
          en: 'If you take a library card or make an account, this is kept:',
          fr: 'Si vous prenez une carte de lecteur ou créez un compte, ceci est gardé :',
          ru: 'Если вы берёте читательский билет или создаёте аккаунт, хранится следующее:',
          vi: 'Nếu bạn lấy thẻ thư viện hoặc tạo tài khoản, những thứ sau được lưu:',
        },
      ],
      items: [
        {
          en: 'Your notebook, copied so that it follows you to your other devices. It is shown to no one else. As with any host, the person who runs the site has access to the database that holds it.',
          fr: 'Votre carnet, copié pour qu’il vous suive sur vos autres appareils. Il n’est montré à personne d’autre. Comme pour tout hébergement, la personne qui tient le site a accès à la base de données qui le contient.',
          ru: 'Ваш блокнот, скопированный, чтобы он был с вами на других устройствах. Его не видит никто другой. Как и у любого хостинга, у человека, который ведёт сайт, есть доступ к базе данных, где он лежит.',
          vi: 'Sổ tay của bạn, được sao chép để theo bạn sang các thiết bị khác. Không ai khác thấy nó. Như với mọi dịch vụ lưu trữ, người vận hành trang có quyền truy cập cơ sở dữ liệu chứa nó.',
        },
        {
          en: 'Your library card: a random code. A fingerprint of it is kept, and the code itself only in encrypted form.',
          fr: 'Votre carte de lecteur : un code aléatoire. Une empreinte en est gardée, et le code lui-même seulement chiffré.',
          ru: 'Ваш читательский билет: случайный код. Хранится его отпечаток, а сам код — только в зашифрованном виде.',
          vi: 'Thẻ thư viện của bạn: một mã ngẫu nhiên. Trang lưu dấu vân tay của mã, còn bản thân mã chỉ ở dạng đã mã hóa.',
        },
        {
          en: 'Your account: a name, which everyone can see beside what you write; an email address, which no one else sees; and a password, kept only in scrambled form. If you sign in with Google, also the identifier Google gives us for your Google account.',
          fr: 'Votre compte : un nom, que tout le monde voit près de ce que vous écrivez ; une adresse e-mail, que personne d’autre ne voit ; et un mot de passe, gardé seulement sous forme brouillée. Si vous vous connectez avec Google, aussi l’identifiant que Google nous donne pour votre compte Google.',
          ru: 'Ваш аккаунт: имя, которое все видят рядом с тем, что вы пишете; адрес электронной почты, который не видит никто другой; и пароль, хранящийся только в зашифрованном виде. Если вы входите через Google — ещё идентификатор, который Google передаёт нам для вашего аккаунта Google.',
          vi: 'Tài khoản của bạn: một cái tên, mọi người đều thấy bên cạnh những gì bạn viết; một địa chỉ email, không ai khác thấy; và một mật khẩu, chỉ được lưu ở dạng đã xáo trộn. Nếu bạn đăng nhập bằng Google, còn có mã định danh mà Google cấp cho chúng tôi về tài khoản Google của bạn.',
        },
        {
          en: 'What you choose to publish: reviews, essays (once the keeper of the site has approved them), replies, a short bio, and the passages from public-domain books that you choose to show on your page. These are public.',
          fr: 'Ce que vous choisissez de publier : avis, essais (une fois approuvés par la personne qui tient le site), réponses, une courte présentation, et les passages de livres du domaine public que vous choisissez d’afficher sur votre page. Cela est public.',
          ru: 'То, что вы решили опубликовать: отзывы, эссе (после одобрения хранителем сайта), ответы, короткое описание о себе и отрывки из книг в общественном достоянии, которые вы выбрали показывать на своей странице. Всё это публично.',
          vi: 'Những gì bạn chọn đăng: cảm nhận, bài luận (khi người giữ trang đã duyệt), phản hồi, vài dòng giới thiệu, và những đoạn trích từ sách thuộc phạm vi công cộng mà bạn chọn hiện trên trang của mình. Những thứ này là công khai.',
        },
      ],
      after: [
        {
          en: 'To stop automated abuse, the site counts requests each day for each internet address, using a fingerprint of the address that changes daily. The address itself is not stored by the site. The host, Cloudflare, may keep ordinary technical logs (address, time, page asked for) as its own policies describe.',
          fr: 'Pour empêcher les abus automatisés, le site compte chaque jour les requêtes de chaque adresse internet, à l’aide d’une empreinte de l’adresse qui change tous les jours. Le site ne garde pas l’adresse elle-même. L’hébergeur, Cloudflare, peut garder des journaux techniques ordinaires (adresse, heure, page demandée), comme le décrivent ses propres règles.',
          ru: 'Чтобы остановить автоматические злоупотребления, сайт каждый день считает запросы с каждого интернет-адреса, используя отпечаток адреса, который меняется ежедневно. Сам адрес сайт не хранит. Хостинг, Cloudflare, может вести обычные технические журналы (адрес, время, запрошенная страница), как описано в его собственных правилах.',
          vi: 'Để chặn lạm dụng tự động, mỗi ngày trang đếm số yêu cầu từ mỗi địa chỉ internet, dùng một dấu vân tay của địa chỉ thay đổi hằng ngày. Bản thân địa chỉ không được trang lưu. Nhà cung cấp lưu trữ, Cloudflare, có thể giữ nhật ký kỹ thuật thông thường (địa chỉ, thời gian, trang được yêu cầu) theo chính sách riêng của họ.',
        },
      ],
    },
    {
      title: { en: 'Signing in with Google', fr: 'Se connecter avec Google', ru: 'Вход через Google', vi: 'Đăng nhập bằng Google' },
      body: [
        {
          en: 'If you choose “Continue with Google”, Google tells Incipit your email address and an identifier for your Google account, and that you signed in. Incipit asks for nothing else: no contacts, no calendar, no files, no access to your Google account after you have signed in.',
          fr: 'Si vous choisissez « Continuer avec Google », Google indique à Incipit votre adresse e-mail et un identifiant de votre compte Google, et que vous vous êtes connecté. Incipit ne demande rien d’autre : ni contacts, ni agenda, ni fichiers, aucun accès à votre compte Google une fois connecté.',
          ru: 'Если вы выбираете «Продолжить с Google», Google сообщает Incipit ваш адрес электронной почты, идентификатор вашего аккаунта Google и то, что вы вошли. Ничего другого Incipit не запрашивает: ни контактов, ни календаря, ни файлов, ни доступа к вашему аккаунту Google после входа.',
          vi: 'Nếu bạn chọn “Tiếp tục với Google”, Google cho Incipit biết địa chỉ email, mã định danh tài khoản Google của bạn, và việc bạn đã đăng nhập. Incipit không xin gì khác: không danh bạ, không lịch, không tệp, không quyền truy cập tài khoản Google của bạn sau khi đăng nhập.',
        },
        {
          en: 'They are used only to sign you in, and to send you a letter if you ask for a new password. They are not sold, not shared, and not used for advertising. Incipit’s use of information received from Google follows the Google API Services User Data Policy, including its Limited Use requirements.',
          fr: 'Elles servent seulement à vous connecter, et à vous envoyer une lettre si vous demandez un nouveau mot de passe. Elles ne sont ni vendues, ni partagées, ni utilisées pour de la publicité. L’usage par Incipit des informations reçues de Google respecte la politique de Google sur les données utilisateur des services d’API, y compris ses exigences d’utilisation limitée.',
          ru: 'Они используются только для входа и для отправки письма, если вы попросите новый пароль. Они не продаются, не передаются и не используются для рекламы. Использование Incipit информации, полученной от Google, соответствует Политике в отношении пользовательских данных сервисов Google API, включая требования ограниченного использования (Limited Use).',
          vi: 'Chúng chỉ được dùng để đăng nhập cho bạn, và để gửi thư nếu bạn xin mật khẩu mới. Chúng không bị bán, không được chia sẻ và không dùng cho quảng cáo. Việc Incipit dùng thông tin nhận từ Google tuân theo Chính sách dữ liệu người dùng của Dịch vụ API Google, kể cả các yêu cầu Sử dụng giới hạn (Limited Use).',
        },
      ],
    },
    {
      title: { en: 'Who else handles your data', fr: 'Qui d’autre traite vos données', ru: 'Кто ещё работает с вашими данными', vi: 'Ai khác xử lý dữ liệu của bạn' },
      items: [
        {
          en: 'Cloudflare hosts the site and its database.',
          fr: 'Cloudflare héberge le site et sa base de données.',
          ru: 'Cloudflare размещает сайт и его базу данных.',
          vi: 'Cloudflare lưu trữ trang và cơ sở dữ liệu của trang.',
        },
        {
          en: 'Google supplies the sign-in button, if you use it, and the typefaces. Your browser contacts Google’s servers to load them, which shows Google your internet address.',
          fr: 'Google fournit le bouton de connexion, si vous l’utilisez, et les caractères typographiques. Votre navigateur contacte les serveurs de Google pour les charger, ce qui montre votre adresse internet à Google.',
          ru: 'Google предоставляет кнопку входа, если вы ею пользуетесь, и шрифты. Ваш браузер обращается к серверам Google, чтобы их загрузить, и Google видит ваш интернет-адрес.',
          vi: 'Google cung cấp nút đăng nhập, nếu bạn dùng, và các phông chữ. Trình duyệt của bạn liên hệ máy chủ của Google để tải chúng, nên Google thấy địa chỉ internet của bạn.',
        },
        {
          en: 'The words you type into “Or in a few words” are read by an AI model, to turn them into the site’s filters. Incipit does not keep them. Outside the European Economic Area, Switzerland and the United Kingdom, Google’s Gemini reads them, through its free service: Google may use them to improve its products, and people at Google may read them. In those countries, and whenever Gemini cannot answer, Cloudflare’s Workers AI reads them with Meta’s Llama model; Cloudflare says it does not use them to train models. Do not type anything personal there.',
          fr: 'Les mots que vous tapez dans « Ou en quelques mots » sont lus par un modèle d’IA, pour en faire les filtres du site. Incipit ne les garde pas. Hors de l’Espace économique européen, de la Suisse et du Royaume-Uni, Gemini de Google les lit, par son service gratuit : Google peut s’en servir pour améliorer ses produits, et des personnes chez Google peuvent les lire. Dans ces pays, et chaque fois que Gemini ne peut pas répondre, Workers AI de Cloudflare les lit avec le modèle Llama de Meta ; Cloudflare dit ne pas s’en servir pour entraîner des modèles. N’y tapez rien de personnel.',
          ru: 'Слова, которые вы вводите в поле «Или в нескольких словах», читает ИИ-модель, чтобы превратить их в фильтры сайта. Incipit их не хранит. За пределами Европейской экономической зоны, Швейцарии и Великобритании их читает Gemini от Google через бесплатный сервис: Google может использовать их для улучшения своих продуктов, и их могут читать сотрудники Google. В этих странах, а также когда Gemini не может ответить, их читает Workers AI от Cloudflare с моделью Llama от Meta; Cloudflare заявляет, что не использует их для обучения моделей. Не пишите туда ничего личного.',
          vi: 'Những chữ bạn gõ vào ô “Hoặc vài chữ” được một mô hình AI đọc để biến thành bộ lọc của trang. Incipit không lưu chúng. Ngoài Khu vực Kinh tế châu Âu, Thụy Sĩ và Vương quốc Anh, Gemini của Google đọc chúng qua dịch vụ miễn phí: Google có thể dùng chúng để cải thiện sản phẩm, và nhân viên Google có thể đọc chúng. Ở những nước đó, và mỗi khi Gemini không trả lời được, Workers AI của Cloudflare đọc chúng bằng mô hình Llama của Meta; Cloudflare cho biết họ không dùng chúng để huấn luyện mô hình. Đừng gõ điều gì riêng tư vào đó.',
        },
        {
          en: 'Brevo sends the letter that sets a new password, so it receives your email address and that letter.',
          fr: 'Brevo envoie la lettre qui permet de choisir un nouveau mot de passe ; il reçoit donc votre adresse e-mail et cette lettre.',
          ru: 'Brevo отправляет письмо для смены пароля, поэтому получает ваш адрес электронной почты и само письмо.',
          vi: 'Brevo gửi thư đặt mật khẩu mới, nên nhận địa chỉ email của bạn và lá thư đó.',
        },
      ],
      after: [{ en: 'Nothing is sold, and nothing is given to anyone to advertise with.', fr: 'Rien n’est vendu, et rien n’est donné à quiconque pour faire de la publicité.', ru: 'Ничего не продаётся и ничего никому не передаётся для рекламы.', vi: 'Không có gì bị bán, và không có gì được trao cho ai để làm quảng cáo.' }],
    },
    {
      title: { en: 'Keeping and erasing', fr: 'Conserver et effacer', ru: 'Хранение и удаление', vi: 'Lưu giữ và xóa' },
      body: [
        {
          en: 'What is kept stays until you erase it. On the Sign in page, under “The library card behind your account”, “Erase the card and its copy” deletes your account, the copy of your notebook, your reviews, your essays and your replies from the server. The notebook in your browser stays with you.',
          fr: 'Ce qui est gardé le reste jusqu’à ce que vous l’effaciez. Sur la page de connexion, sous « La carte de lecteur derrière votre compte », « Effacer la carte et sa copie » supprime du serveur votre compte, la copie de votre carnet, vos avis, vos essais et vos réponses. Le carnet de votre navigateur reste avec vous.',
          ru: 'Всё сохранённое остаётся, пока вы его не сотрёте. На странице входа, в разделе «Читательский билет вашего аккаунта», кнопка «Стереть билет и его копию» удаляет с сервера ваш аккаунт, копию блокнота, ваши отзывы, эссе и ответы. Блокнот в вашем браузере остаётся у вас.',
          vi: 'Những gì được lưu sẽ ở đó cho đến khi bạn xóa. Trên trang Đăng nhập, ở mục “Thẻ thư viện đằng sau tài khoản của bạn”, nút “Xóa thẻ và bản sao của nó” xóa khỏi máy chủ tài khoản, bản sao sổ tay, các cảm nhận, bài luận và phản hồi của bạn. Sổ tay trong trình duyệt vẫn ở lại với bạn.',
        },
        {
          en: 'You can also ask for a copy of what is kept about you, for a correction, or for erasure, by writing to the address below. A link that sets a new password works once, for thirty minutes.',
          fr: 'Vous pouvez aussi demander une copie de ce qui est gardé sur vous, une correction ou l’effacement, en écrivant à l’adresse ci-dessous. Un lien qui permet de choisir un nouveau mot de passe ne fonctionne qu’une fois, pendant trente minutes.',
          ru: 'Вы также можете запросить копию того, что о вас хранится, исправление или удаление, написав по адресу ниже. Ссылка для нового пароля срабатывает один раз в течение тридцати минут.',
          vi: 'Bạn cũng có thể xin một bản sao những gì được lưu về mình, xin sửa hoặc xin xóa, bằng cách viết tới địa chỉ bên dưới. Đường dẫn đặt mật khẩu mới chỉ dùng được một lần, trong ba mươi phút.',
        },
      ],
    },
    {
      title: { en: 'Changes', fr: 'Modifications', ru: 'Изменения', vi: 'Thay đổi' },
      body: [{ en: 'If this page changes, the date at the top changes with it.', fr: 'Si cette page change, la date en haut change avec elle.', ru: 'Если эта страница изменится, вместе с ней изменится и дата вверху.', vi: 'Nếu trang này thay đổi, ngày ở đầu trang sẽ đổi theo.' }],
    },
  ],
};

const TERMS: Doc = {
  title: TEXT.terms,
  lead: {
    en: 'Incipit is a personal project, free to use. By using it, or by making an account, you accept these few terms.',
    fr: 'Incipit est un projet personnel, gratuit. En l’utilisant, ou en créant un compte, vous acceptez ces quelques conditions.',
    ru: 'Incipit — личный проект, пользоваться им бесплатно. Пользуясь им или создавая аккаунт, вы принимаете эти несколько условий.',
    vi: 'Incipit là một dự án cá nhân, dùng miễn phí. Khi dùng trang, hoặc tạo tài khoản, bạn chấp nhận vài điều khoản này.',
  },
  parts: [
    {
      title: { en: 'Using Incipit', fr: 'Utiliser Incipit', ru: 'Как пользоваться Incipit', vi: 'Sử dụng Incipit' },
      body: [
        {
          en: 'The site helps you find books and read the ones that are out of copyright. For the others it says what the book is like and points to a library or a bookshop; it does not offer them. Its descriptions and moods are its keeper’s own judgement, not a guarantee that you will like a book.',
          fr: 'Le site vous aide à trouver des livres et à lire ceux qui sont dans le domaine public. Pour les autres, il dit à quoi ressemble le livre et indique une bibliothèque ou une librairie ; il ne les propose pas. Ses descriptions et ses humeurs sont le jugement de la personne qui le tient, non la garantie que vous aimerez un livre.',
          ru: 'Сайт помогает находить книги и читать те, что вышли из-под авторского права. О других он рассказывает, какие они, и указывает библиотеку или книжный магазин; он их не предлагает. Его описания и настроения — личное суждение хранителя, а не гарантия, что книга вам понравится.',
          vi: 'Trang giúp bạn tìm sách và đọc những cuốn đã hết bản quyền. Với những cuốn khác, trang nói sách ra sao và chỉ tới thư viện hay hiệu sách; trang không cung cấp chúng. Lời mô tả và tâm trạng là nhận định riêng của người giữ trang, không phải lời bảo đảm rằng bạn sẽ thích một cuốn sách.',
        },
      ],
    },
    {
      title: { en: 'Your account', fr: 'Votre compte', ru: 'Ваш аккаунт', vi: 'Tài khoản của bạn' },
      body: [
        {
          en: 'An account is for one person. Keep your password and your library card code to yourself: you are responsible for what is done with them. Your name is shown beside what you write, so do not take someone else’s. You can erase your account at any time (see the privacy policy).',
          fr: 'Un compte est pour une seule personne. Gardez pour vous votre mot de passe et le code de votre carte de lecteur : vous êtes responsable de ce qui en est fait. Votre nom est montré près de ce que vous écrivez ; ne prenez pas celui de quelqu’un d’autre. Vous pouvez effacer votre compte à tout moment (voir la politique de confidentialité).',
          ru: 'Аккаунт — для одного человека. Держите пароль и код читательского билета при себе: вы отвечаете за то, что с ними делается. Ваше имя видно рядом с тем, что вы пишете, поэтому не берите чужое. Вы можете стереть аккаунт в любой момент (см. политику конфиденциальности).',
          vi: 'Một tài khoản dành cho một người. Hãy giữ kín mật khẩu và mã thẻ thư viện: bạn chịu trách nhiệm về những gì được làm với chúng. Tên của bạn hiện bên cạnh những gì bạn viết, nên đừng lấy tên người khác. Bạn có thể xóa tài khoản bất cứ lúc nào (xem chính sách quyền riêng tư).',
        },
      ],
    },
    {
      title: { en: 'What you write', fr: 'Ce que vous écrivez', ru: 'Что вы пишете', vi: 'Những gì bạn viết' },
      body: [
        {
          en: 'Your reviews, essays and replies remain yours. By publishing them here you let Incipit show them on the site, for as long as you leave them there; you can delete them at any time. An approved essay may also appear in search engines.',
          fr: 'Vos avis, essais et réponses restent les vôtres. En les publiant ici, vous autorisez Incipit à les montrer sur le site, tant que vous les y laissez ; vous pouvez les supprimer à tout moment. Un essai approuvé peut aussi apparaître dans les moteurs de recherche.',
          ru: 'Ваши отзывы, эссе и ответы остаются вашими. Публикуя их здесь, вы разрешаете Incipit показывать их на сайте, пока вы их не уберёте; удалить их можно в любой момент. Одобренное эссе может также появиться в поисковых системах.',
          vi: 'Cảm nhận, bài luận và phản hồi của bạn vẫn là của bạn. Khi đăng ở đây, bạn cho phép Incipit hiện chúng trên trang, chừng nào bạn còn để chúng ở đó; bạn có thể xóa bất cứ lúc nào. Một bài luận đã duyệt cũng có thể xuất hiện trên các công cụ tìm kiếm.',
        },
        { en: 'Please do not post:', fr: 'Merci de ne pas publier :', ru: 'Пожалуйста, не публикуйте:', vi: 'Xin đừng đăng:' },
      ],
      items: [
        { en: 'anything hateful, threatening, harassing, or unlawful, or spam;', fr: 'rien de haineux, de menaçant, de harcelant ou d’illégal, ni de pourriel ;', ru: 'ничего ненавистнического, угрожающего, оскорбительного или незаконного, а также спам;', vi: 'bất cứ điều gì gây thù ghét, đe dọa, quấy rối hay trái pháp luật, hoặc thư rác;' },
        { en: 'words you have no right to share. The passages you show on your page can only come from books out of copyright.', fr: 'des mots que vous n’avez pas le droit de partager. Les passages que vous montrez sur votre page ne peuvent venir que de livres du domaine public.', ru: 'тексты, которыми вы не вправе делиться. Отрывки на вашей странице могут быть только из книг без авторских прав.', vi: 'những chữ bạn không có quyền chia sẻ. Các đoạn trích trên trang của bạn chỉ được lấy từ sách đã hết bản quyền.' },
      ],
      after: [
        {
          en: 'The keeper of the site reads each essay before it appears, and may remove anything, or close an account, that breaks these terms.',
          fr: 'La personne qui tient le site lit chaque essai avant qu’il paraisse, et peut retirer tout contenu, ou fermer un compte, qui ne respecte pas ces conditions.',
          ru: 'Хранитель сайта читает каждое эссе до публикации и может убрать что угодно или закрыть аккаунт, нарушающий эти условия.',
          vi: 'Người giữ trang đọc từng bài luận trước khi đăng, và có thể gỡ bất cứ thứ gì, hoặc đóng tài khoản, vi phạm các điều khoản này.',
        },
      ],
    },
    {
      title: { en: 'Books and copyright', fr: 'Livres et droit d’auteur', ru: 'Книги и авторское право', vi: 'Sách và bản quyền' },
      body: [
        {
          en: 'The texts offered to read come from Project Gutenberg and Standard Ebooks and are out of copyright. If you believe something here infringes your rights, write to the address below and it will be looked at promptly.',
          fr: 'Les textes proposés à la lecture viennent de Project Gutenberg et de Standard Ebooks et sont dans le domaine public. Si vous pensez que quelque chose ici porte atteinte à vos droits, écrivez à l’adresse ci-dessous : cela sera examiné sans tarder.',
          ru: 'Тексты, предложенные для чтения, взяты из Project Gutenberg и Standard Ebooks и не защищены авторским правом. Если вы считаете, что что-то здесь нарушает ваши права, напишите по адресу ниже — это быстро рассмотрят.',
          vi: 'Các văn bản để đọc lấy từ Project Gutenberg và Standard Ebooks và đã hết bản quyền. Nếu bạn cho rằng điều gì ở đây vi phạm quyền của mình, hãy viết tới địa chỉ bên dưới và việc đó sẽ được xem xét ngay.',
        },
      ],
    },
    {
      title: { en: 'No guarantees', fr: 'Sans garantie', ru: 'Без гарантий', vi: 'Không bảo đảm' },
      body: [
        {
          en: 'The site is offered as it is. It may change, be unavailable, or close. Your notebook is copied to the server when you have an account, but keep your own copy of anything you cannot lose. As far as the law allows, the keeper is not liable for losses from using the site.',
          fr: 'Le site est proposé tel quel. Il peut changer, être indisponible ou fermer. Votre carnet est copié sur le serveur si vous avez un compte, mais gardez votre propre copie de ce que vous ne pouvez pas perdre. Dans la mesure permise par la loi, la personne qui tient le site n’est pas responsable des pertes liées à son usage.',
          ru: 'Сайт предлагается как есть. Он может измениться, стать недоступным или закрыться. Когда у вас есть аккаунт, блокнот копируется на сервер, но храните собственную копию всего, что не хотите потерять. В пределах, допускаемых законом, хранитель не отвечает за потери от использования сайта.',
          vi: 'Trang được cung cấp nguyên trạng. Trang có thể thay đổi, tạm ngừng hoặc đóng cửa. Sổ tay được sao lên máy chủ khi bạn có tài khoản, nhưng hãy tự giữ một bản của những gì bạn không thể mất. Trong phạm vi pháp luật cho phép, người giữ trang không chịu trách nhiệm về thiệt hại do việc dùng trang.',
        },
      ],
    },
    {
      title: { en: 'Changes', fr: 'Modifications', ru: 'Изменения', vi: 'Thay đổi' },
      body: [{ en: 'If these terms change, the date at the top changes with them.', fr: 'Si ces conditions changent, la date en haut change avec elles.', ru: 'Если эти условия изменятся, вместе с ними изменится и дата вверху.', vi: 'Nếu các điều khoản này thay đổi, ngày ở đầu trang sẽ đổi theo.' }],
    },
  ],
};

function Legal({ doc, other }: { doc: Doc; other: { id: 'privacy' | 'terms'; label: L } }) {
  const { tl } = useI18n();
  useQuickLoader();
  const para = (text: L, key: number): ReactNode => <p key={key}>{tl(text)}</p>;
  return (
    <div className="legal">
      <PageHeader />
      <main className="legal-body">
        <article>
          <p className="page-eyebrow">{tl(TEXT.eyebrow)}</p>
          <h1>{tl(doc.title)}</h1>
          <p className="legal-updated">
            {tl(TEXT.updated)}: {tl(UPDATED)}
          </p>
          <p className="legal-lead">{tl(doc.lead)}</p>
          {doc.parts.map((part) => (
            <section key={part.title.en}>
              <h2>{tl(part.title)}</h2>
              {part.body?.map(para)}
              {part.items && (
                <ul>
                  {part.items.map((item, at) => (
                    <li key={at}>{tl(item)}</li>
                  ))}
                </ul>
              )}
              {part.after?.map(para)}
            </section>
          ))}
          <p className="legal-contact">
            {tl(TEXT.contact)} <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
          </p>
          <p className="legal-other">
            <a href={pageUrl(other.id)}>{tl(other.label)} →</a>
          </p>
        </article>
      </main>
    </div>
  );
}

export function Privacy() {
  return <Legal doc={PRIVACY} other={{ id: 'terms', label: TEXT.terms }} />;
}

export function Terms() {
  return <Legal doc={TERMS} other={{ id: 'privacy', label: TEXT.privacy }} />;
}
