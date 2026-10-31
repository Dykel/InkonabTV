/* Interface language: follows the device language (TV menu language on Samsung / Android TV).
   English is written in the code; this file translates the visible text as it appears on the
   page (text, placeholder, aria-label, title), so app.js keeps plain English strings.
   Rows are [fr, es, de, it, pt]. Content names (channels, movies) are never in this list. */
(function () {
  const LANGS = ['fr', 'es', 'de', 'it', 'pt'];
  const lang = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
  const col = LANGS.indexOf(lang);
  const locale = col < 0 ? 'en-US' : navigator.language || lang;
  window.I18N = { lang: col < 0 ? 'en' : lang, locale };
  window.T = s => s;
  // The TV menu language changed while the app was open: reload in the new language.
  window.addEventListener('languagechange', () => location.reload());
  if (col < 0) return;

  const D = {
    // sign in
    'Sign in with your InkonabTV subscription': ['Connectez-vous avec votre abonnement', 'Inicia sesión con tu suscripción', 'Melde dich mit deinem Abo an', 'Accedi con il tuo abbonamento', 'Inicie sessão com a sua subscrição'],
    'Add your playlist': ['Ajoutez votre playlist', 'Añade tu lista', 'Füge deine Playlist hinzu', 'Aggiungi la tua playlist', 'Adicione a sua lista'],
    'InkonabTV is a media player. It doesn’t include or sell any channels or content: add the playlist you get from your own provider.': [
      'InkonabTV est un lecteur multimédia. Il ne contient ni ne vend aucune chaîne ni aucun contenu : ajoutez la playlist fournie par votre propre fournisseur.',
      'InkonabTV es un reproductor multimedia. No incluye ni vende canales ni contenidos: añade la lista que te da tu propio proveedor.',
      'InkonabTV ist ein Mediaplayer. Er enthält oder verkauft keine Sender oder Inhalte: Füge die Playlist deines eigenen Anbieters hinzu.',
      'InkonabTV è un lettore multimediale. Non include né vende canali o contenuti: aggiungi la playlist del tuo fornitore.',
      'O InkonabTV é um leitor multimédia. Não inclui nem vende canais ou conteúdos: adicione a lista do seu próprio fornecedor.'],
    'Xtream Codes': ['Xtream Codes', 'Xtream Codes', 'Xtream Codes', 'Xtream Codes', 'Xtream Codes'],
    'M3U playlist': ['Playlist M3U', 'Lista M3U', 'M3U-Playlist', 'Playlist M3U', 'Lista M3U'],
    'Set up from phone': ['Configurer depuis le téléphone', 'Configurar desde el móvil', 'Per Handy einrichten', 'Configura dal telefono', 'Configurar pelo telemóvel'],
    'Server address': ['Adresse du serveur', 'Dirección del servidor', 'Serveradresse', 'Indirizzo del server', 'Endereço do servidor'],
    'Playlist link (M3U)': ['Lien de la playlist (M3U)', 'Enlace de la lista (M3U)', 'Playlist-Link (M3U)', 'Link della playlist (M3U)', 'Link da lista (M3U)'],
    'Username': ['Nom d’utilisateur', 'Usuario', 'Benutzername', 'Nome utente', 'Nome de utilizador'],
    'Password': ['Mot de passe', 'Contraseña', 'Passwort', 'Password', 'Palavra-passe'],
    'Keep me signed in on this device': ['Rester connecté sur cet appareil', 'Mantener la sesión en este dispositivo', 'Auf diesem Gerät angemeldet bleiben', 'Resta connesso su questo dispositivo', 'Manter sessão neste dispositivo'],
    'Sign in': ['Se connecter', 'Iniciar sesión', 'Anmelden', 'Accedi', 'Iniciar sessão'],
    'Signing in…': ['Connexion…', 'Iniciando sesión…', 'Anmeldung…', 'Accesso…', 'A iniciar sessão…'],
    'Enter your username and password.': ['Saisissez votre nom d’utilisateur et votre mot de passe.', 'Introduce tu usuario y contraseña.', 'Gib Benutzername und Passwort ein.', 'Inserisci nome utente e password.', 'Introduza o nome de utilizador e a palavra-passe.'],
    'Enter the server address, username and password.': ['Saisissez l’adresse du serveur, le nom d’utilisateur et le mot de passe.', 'Introduce la dirección del servidor, el usuario y la contraseña.', 'Gib Serveradresse, Benutzername und Passwort ein.', 'Inserisci indirizzo del server, nome utente e password.', 'Introduza o endereço do servidor, o utilizador e a palavra-passe.'],
    'Enter the playlist link.': ['Saisissez le lien de la playlist.', 'Introduce el enlace de la lista.', 'Gib den Playlist-Link ein.', 'Inserisci il link della playlist.', 'Introduza o link da lista.'],
    'Wrong username or password': ['Nom d’utilisateur ou mot de passe incorrect', 'Usuario o contraseña incorrectos', 'Falscher Benutzername oder falsches Passwort', 'Nome utente o password errati', 'Utilizador ou palavra-passe incorretos'],
    'Can’t reach the server. Check your connection.': ['Impossible de joindre le serveur. Vérifiez votre connexion.', 'No se puede conectar con el servidor. Revisa tu conexión.', 'Server nicht erreichbar. Prüfe deine Verbindung.', 'Impossibile raggiungere il server. Controlla la connessione.', 'Não é possível contactar o servidor. Verifique a ligação.'],
    'Can’t load the playlist. Check the link and your connection.': ['Impossible de charger la playlist. Vérifiez le lien et votre connexion.', 'No se puede cargar la lista. Revisa el enlace y tu conexión.', 'Playlist kann nicht geladen werden. Prüfe Link und Verbindung.', 'Impossibile caricare la playlist. Controlla il link e la connessione.', 'Não é possível carregar a lista. Verifique o link e a ligação.'],
    'This playlist is empty': ['Cette playlist est vide', 'Esta lista está vacía', 'Diese Playlist ist leer', 'Questa playlist è vuota', 'Esta lista está vazia'],
    'On your phone or computer, open': ['Sur votre téléphone ou ordinateur, ouvrez', 'En tu móvil u ordenador, abre', 'Öffne auf Handy oder Computer', 'Sul telefono o computer, apri', 'No telemóvel ou computador, abra'],
    'and enter this code:': ['et saisissez ce code :', 'e introduce este código:', 'und gib diesen Code ein:', 'e inserisci questo codice:', 'e introduza este código:'],
    'or scan the QR code. The code works once and changes every 15 minutes.': ['ou scannez le QR code. Le code ne sert qu’une fois et change toutes les 15 minutes.', 'o escanea el código QR. El código sirve una vez y cambia cada 15 minutos.', 'oder scanne den QR-Code. Der Code gilt einmal und ändert sich alle 15 Minuten.', 'o scansiona il codice QR. Il codice vale una volta e cambia ogni 15 minuti.', 'ou leia o código QR. O código funciona uma vez e muda a cada 15 minutos.'],
    'Getting a code…': ['Obtention d’un code…', 'Obteniendo un código…', 'Code wird geholt…', 'Richiesta del codice…', 'A obter um código…'],
    'Remote setup isn’t available right now. Try again later.': ['La configuration à distance est indisponible. Réessayez plus tard.', 'La configuración remota no está disponible. Inténtalo más tarde.', 'Fernkonfiguration ist gerade nicht verfügbar. Versuche es später.', 'La configurazione remota non è disponibile. Riprova più tardi.', 'A configuração remota não está disponível. Tente mais tarde.'],
    'Remote setup': ['Configuration à distance', 'Configuración remota', 'Fernkonfiguration', 'Configurazione remota', 'Configuração remota'],
    'Code shown on the TV': ['Code affiché sur le téléviseur', 'Código que aparece en la TV', 'Code auf dem Fernseher', 'Codice mostrato sulla TV', 'Código mostrado na TV'],
    'Send to TV': ['Envoyer au téléviseur', 'Enviar a la TV', 'An Fernseher senden', 'Invia alla TV', 'Enviar para a TV'],
    'Sent to the TV ✓': ['Envoyé au téléviseur ✓', 'Enviado a la TV ✓', 'An den Fernseher gesendet ✓', 'Inviato alla TV ✓', 'Enviado para a TV ✓'],
    'The TV signs in by itself within a few seconds. You can close this page.': ['Le téléviseur se connecte tout seul en quelques secondes. Vous pouvez fermer cette page.', 'La TV inicia sesión sola en unos segundos. Puedes cerrar esta página.', 'Der Fernseher meldet sich in wenigen Sekunden selbst an. Du kannst die Seite schließen.', 'La TV accede da sola in pochi secondi. Puoi chiudere questa pagina.', 'A TV inicia sessão sozinha em segundos. Pode fechar esta página.'],
    'Enter the 6-character code shown on the TV.': ['Saisissez le code à 6 caractères affiché sur le téléviseur.', 'Introduce el código de 6 caracteres de la TV.', 'Gib den 6-stelligen Code vom Fernseher ein.', 'Inserisci il codice di 6 caratteri della TV.', 'Introduza o código de 6 caracteres da TV.'],
    'This code was already used. Ask for the new code on the TV.': ['Ce code a déjà servi. Utilisez le nouveau code affiché sur le téléviseur.', 'Este código ya se usó. Usa el nuevo código de la TV.', 'Dieser Code wurde schon benutzt. Nimm den neuen Code vom Fernseher.', 'Questo codice è già stato usato. Usa il nuovo codice della TV.', 'Este código já foi usado. Use o novo código da TV.'],
    'This code is wrong or has expired. Check the code on the TV.': ['Ce code est incorrect ou a expiré. Vérifiez le code sur le téléviseur.', 'El código es incorrecto o ha caducado. Revisa el código de la TV.', 'Der Code ist falsch oder abgelaufen. Prüfe den Code am Fernseher.', 'Il codice è errato o scaduto. Controlla il codice sulla TV.', 'O código está errado ou expirou. Verifique o código na TV.'],
    'The account goes straight to the TV that shows this code and is deleted as soon as the TV receives it (at most 15 minutes later). InkonabTV is a media player: it doesn’t include or sell any channels or content.': [
      'Le compte est envoyé directement au téléviseur qui affiche ce code, puis supprimé dès sa réception (au plus tard 15 minutes après). InkonabTV est un lecteur : il ne contient ni ne vend aucune chaîne ni aucun contenu.',
      'La cuenta va directamente a la TV que muestra este código y se borra en cuanto la recibe (como máximo 15 minutos después). InkonabTV es un reproductor: no incluye ni vende canales ni contenidos.',
      'Das Konto geht direkt an den Fernseher mit diesem Code und wird gelöscht, sobald er es erhält (spätestens nach 15 Minuten). InkonabTV ist ein Player: Er enthält oder verkauft keine Sender oder Inhalte.',
      'L’account va direttamente alla TV che mostra questo codice e viene cancellato appena ricevuto (al massimo dopo 15 minuti). InkonabTV è un lettore: non include né vende canali o contenuti.',
      'A conta vai diretamente para a TV que mostra este código e é apagada assim que a TV a recebe (no máximo 15 minutos depois). O InkonabTV é um leitor: não inclui nem vende canais ou conteúdos.'],
    'Received — signing in…': ['Reçu — connexion…', 'Recibido — iniciando sesión…', 'Empfangen — Anmeldung…', 'Ricevuto — accesso…', 'Recebido — a iniciar sessão…'],

    // navigation
    'Home': ['Accueil', 'Inicio', 'Start', 'Home', 'Início'],
    'Live TV': ['TV en direct', 'TV en directo', 'Live-TV', 'TV in diretta', 'TV em direto'],
    'TV Guide': ['Guide TV', 'Guía TV', 'TV-Programm', 'Guida TV', 'Guia TV'],
    'Movies': ['Films', 'Películas', 'Filme', 'Film', 'Filmes'],
    'Series': ['Séries', 'Series', 'Serien', 'Serie', 'Séries'],
    'Search': ['Rechercher', 'Buscar', 'Suchen', 'Cerca', 'Pesquisar'],
    'Settings': ['Paramètres', 'Ajustes', 'Einstellungen', 'Impostazioni', 'Definições'],
    'Account': ['Compte', 'Cuenta', 'Konto', 'Account', 'Conta'],
    'Back': ['Retour', 'Atrás', 'Zurück', 'Indietro', 'Voltar'],
    'Close': ['Fermer', 'Cerrar', 'Schließen', 'Chiudi', 'Fechar'],
    'Previous': ['Précédent', 'Anterior', 'Zurück', 'Precedente', 'Anterior'],
    'Next': ['Suivant', 'Siguiente', 'Weiter', 'Successivo', 'Seguinte'],

    // home and catalog
    'Watch now': ['Regarder', 'Ver ahora', 'Jetzt ansehen', 'Guarda ora', 'Ver agora'],
    'More info': ['Plus d’infos', 'Más información', 'Mehr Infos', 'Altre info', 'Mais informação'],
    'Continue Watching': ['Reprendre la lecture', 'Seguir viendo', 'Weiterschauen', 'Continua a guardare', 'Continuar a ver'],
    'Latest added': ['Derniers ajouts', 'Añadidos recientemente', 'Neu hinzugefügt', 'Aggiunti di recente', 'Adicionados recentemente'],
    'Top rated': ['Les mieux notés', 'Mejor valorados', 'Am besten bewertet', 'Più votati', 'Mais bem avaliados'],
    'New episodes': ['Nouveaux épisodes', 'Nuevos episodios', 'Neue Folgen', 'Nuovi episodi', 'Novos episódios'],
    'My List': ['Ma liste', 'Mi lista', 'Meine Liste', 'La mia lista', 'A minha lista'],
    '★ My List': ['★ Ma liste', '★ Mi lista', '★ Meine Liste', '★ La mia lista', '★ A minha lista'],
    '☆ My List': ['☆ Ma liste', '☆ Mi lista', '☆ Meine Liste', '☆ La mia lista', '☆ A minha lista'],
    '★ In My List': ['★ Dans ma liste', '★ En mi lista', '★ In meiner Liste', '★ Nella mia lista', '★ Na minha lista'],
    'In My List': ['Dans ma liste', 'En mi lista', 'In meiner Liste', 'Nella mia lista', 'Na minha lista'],
    'Top picks': ['Sélection', 'Destacados', 'Top-Auswahl', 'I migliori', 'Destaques'],
    'Most watched': ['Les plus regardés', 'Lo más visto', 'Meistgesehen', 'I più visti', 'Mais vistos'],
    'Most watched movies': ['Films les plus regardés', 'Películas más vistas', 'Meistgesehene Filme', 'Film più visti', 'Filmes mais vistos'],
    'Most watched series': ['Séries les plus regardées', 'Series más vistas', 'Meistgesehene Serien', 'Serie più viste', 'Séries mais vistas'],
    'Default order': ['Ordre par défaut', 'Orden predeterminado', 'Standardreihenfolge', 'Ordine predefinito', 'Ordem predefinida'],
    'Recently added': ['Ajoutés récemment', 'Añadidos recientemente', 'Zuletzt hinzugefügt', 'Aggiunti di recente', 'Adicionados recentemente'],
    'A – Z': ['A – Z', 'A – Z', 'A – Z', 'A – Z', 'A – Z'],
    'Filter categories': ['Filtrer les catégories', 'Filtrar categorías', 'Kategorien filtern', 'Filtra categorie', 'Filtrar categorias'],
    'Nothing here yet.': ['Rien ici pour le moment.', 'Aún no hay nada aquí.', 'Hier ist noch nichts.', 'Ancora niente qui.', 'Ainda não há nada aqui.'],
    'Nothing in My List yet. Open a title and choose “☆ My List” to add it here.': ['Votre liste est vide. Ouvrez un titre et choisissez « ☆ Ma liste » pour l’ajouter.', 'Tu lista está vacía. Abre un título y elige «☆ Mi lista» para añadirlo.', 'Deine Liste ist leer. Öffne einen Titel und wähle „☆ Meine Liste“.', 'La tua lista è vuota. Apri un titolo e scegli «☆ La mia lista».', 'A sua lista está vazia. Abra um título e escolha «☆ A minha lista».'],
    'Couldn’t load this page': ['Impossible de charger cette page', 'No se pudo cargar esta página', 'Seite konnte nicht geladen werden', 'Impossibile caricare la pagina', 'Não foi possível carregar a página'],
    'Try again': ['Réessayer', 'Reintentar', 'Erneut versuchen', 'Riprova', 'Tentar novamente'],
    'Server not reachable · connecting the free VPN…': ['Serveur injoignable · connexion au VPN gratuit…', 'Servidor inaccesible · conectando la VPN gratuita…', 'Server nicht erreichbar · kostenloses VPN wird verbunden…', 'Server non raggiungibile · connessione alla VPN gratuita…', 'Servidor inacessível · a ligar a VPN gratuita…'],
    'Server not reachable · showing your saved playlist': ['Serveur injoignable · playlist enregistrée affichée', 'Servidor inaccesible · se muestra tu lista guardada', 'Server nicht erreichbar · gespeicherte Playlist wird angezeigt', 'Server non raggiungibile · playlist salvata', 'Servidor inacessível · a mostrar a lista guardada'],
    'We’re optimising your internet connection': ['Nous optimisons votre connexion internet', 'Estamos optimizando tu conexión a internet', 'Wir optimieren deine Internetverbindung', 'Stiamo ottimizzando la tua connessione internet', 'Estamos a otimizar a sua ligação à internet'],
    'Please wait, this can take up to a minute.': ['Veuillez patienter, cela peut prendre jusqu’à une minute.', 'Espera, puede tardar hasta un minuto.', 'Bitte warten, das kann bis zu einer Minute dauern.', 'Attendi, può richiedere fino a un minuto.', 'Aguarde, pode demorar até um minuto.'],
    'Looking for the fastest route…': ['Recherche de la route la plus rapide…', 'Buscando la ruta más rápida…', 'Schnellste Route wird gesucht…', 'Ricerca del percorso più veloce…', 'A procurar a rota mais rápida…'],
    'Finding a faster route…': ['Recherche d’une route plus rapide…', 'Buscando una ruta más rápida…', 'Schnellere Route wird gesucht…', 'Ricerca di un percorso più veloce…', 'A procurar uma rota mais rápida…'],
    'Testing the speed…': ['Test de la vitesse…', 'Probando la velocidad…', 'Geschwindigkeit wird getestet…', 'Test della velocità…', 'A testar a velocidade…'],
    'Connected · signing you in…': ['Connecté · connexion à votre compte…', 'Conectado · iniciando sesión…', 'Verbunden · Anmeldung läuft…', 'Connesso · accesso in corso…', 'Ligado · a iniciar sessão…'],
    'No free server answered': ['Aucun serveur gratuit n’a répondu', 'Ningún servidor gratuito respondió', 'Kein kostenloser Server hat geantwortet', 'Nessun server gratuito ha risposto', 'Nenhum servidor gratuito respondeu'],
    'Playlist updated': ['Playlist mise à jour', 'Lista actualizada', 'Playlist aktualisiert', 'Playlist aggiornata', 'Lista atualizada'],
    'Movie': ['Film', 'Película', 'Film', 'Film', 'Filme'],
    'Radio': ['Radio', 'Radio', 'Radio', 'Radio', 'Rádio'],
    'Live radio': ['Radio en direct', 'Radio en directo', 'Live-Radio', 'Radio in diretta', 'Rádio em direto'],

    // live TV and guide
    'Channels': ['Chaînes', 'Canales', 'Sender', 'Canali', 'Canais'],
    'Groups': ['Groupes', 'Grupos', 'Gruppen', 'Gruppi', 'Grupos'],
    'Favorites': ['Favoris', 'Favoritos', 'Favoriten', 'Preferiti', 'Favoritos'],
    'Favorite': ['Favori', 'Favorito', 'Favorit', 'Preferito', 'Favorito'],
    'Recently watched': ['Vus récemment', 'Vistos recientemente', 'Zuletzt gesehen', 'Visti di recente', 'Vistos recentemente'],
    'Find channel': ['Trouver une chaîne', 'Buscar canal', 'Sender suchen', 'Trova canale', 'Procurar canal'],
    'Choose a group': ['Choisissez un groupe', 'Elige un grupo', 'Gruppe wählen', 'Scegli un gruppo', 'Escolha um grupo'],
    'No channels': ['Aucune chaîne', 'Sin canales', 'Keine Sender', 'Nessun canale', 'Sem canais'],
    'No channels.': ['Aucune chaîne.', 'Sin canales.', 'Keine Sender.', 'Nessun canale.', 'Sem canais.'],
    'Select a channel to see what’s on.': ['Choisissez une chaîne pour voir le programme.', 'Elige un canal para ver qué echan.', 'Wähle einen Sender, um das Programm zu sehen.', 'Scegli un canale per vedere cosa c’è in onda.', 'Escolha um canal para ver o que está a dar.'],
    'No guide information for this channel.': ['Pas de guide pour cette chaîne.', 'No hay guía para este canal.', 'Keine Programminfos für diesen Sender.', 'Nessuna guida per questo canale.', 'Sem guia para este canal.'],
    'No guide information': ['Pas d’informations de programme', 'Sin información de guía', 'Keine Programminfos', 'Nessuna informazione', 'Sem informação de guia'],
    'Open the TV Guide for the full week ›': ['Ouvrir le guide TV de la semaine ›', 'Abrir la guía de toda la semana ›', 'TV-Programm der ganzen Woche öffnen ›', 'Apri la guida della settimana ›', 'Abrir o guia da semana ›'],
    'Move through the guide to see programme details. OK plays live programmes and replays past ones marked ⟲.': ['Parcourez le guide pour voir les détails. OK lit le direct et rejoue les programmes passés marqués ⟲.', 'Recorre la guía para ver los detalles. OK reproduce el directo y repite los programas pasados marcados con ⟲.', 'Bewege dich durch das Programm für Details. OK spielt Live-Sendungen und wiederholt vergangene mit ⟲.', 'Scorri la guida per i dettagli. OK riproduce la diretta e i programmi passati segnati ⟲.', 'Percorra o guia para ver detalhes. OK reproduz o direto e repete os programas passados marcados ⟲.'],
    'OK to watch live': ['OK pour regarder en direct', 'OK para ver en directo', 'OK für live', 'OK per la diretta', 'OK para ver em direto'],
    'Now': ['Maintenant', 'Ahora', 'Jetzt', 'Ora', 'Agora'],
    'Live': ['Direct', 'Directo', 'Live', 'Diretta', 'Direto'],
    '● Live now': ['● En direct', '● En directo', '● Jetzt live', '● In diretta', '● Em direto'],
    '⟲ Replay — press OK': ['⟲ Revoir — appuyez sur OK', '⟲ Volver a ver — pulsa OK', '⟲ Wiederholen — OK drücken', '⟲ Rivedi — premi OK', '⟲ Rever — prima OK'],
    'Ended': ['Terminé', 'Terminado', 'Beendet', 'Terminato', 'Terminado'],
    'Upcoming': ['À venir', 'Próximamente', 'Demnächst', 'Prossimamente', 'A seguir'],
    'Replay': ['Revoir', 'Volver a ver', 'Wiederholung', 'Rivedi', 'Rever'],
    'Catch-up': ['Replay', 'Ver de nuevo', 'Mediathek', 'Replay', 'Repetição'],
    'Today': ['Aujourd’hui', 'Hoy', 'Heute', 'Oggi', 'Hoje'],
    'Yesterday': ['Hier', 'Ayer', 'Gestern', 'Ieri', 'Ontem'],
    'Tomorrow': ['Demain', 'Mañana', 'Morgen', 'Domani', 'Amanhã'],
    'This programme is no longer in the replay archive': ['Ce programme n’est plus disponible en replay', 'Este programa ya no está en el archivo', 'Diese Sendung ist nicht mehr im Archiv', 'Questo programma non è più nell’archivio', 'Este programa já não está no arquivo'],
    'Replay isn’t available on this channel': ['Le replay n’est pas disponible sur cette chaîne', 'No se puede volver a ver en este canal', 'Wiederholung ist für diesen Sender nicht verfügbar', 'Il replay non è disponibile su questo canale', 'A repetição não está disponível neste canal'],
    'Add to favorites': ['Ajouter aux favoris', 'Añadir a favoritos', 'Zu Favoriten', 'Aggiungi ai preferiti', 'Adicionar aos favoritos'],
    'Channel list': ['Liste des chaînes', 'Lista de canales', 'Senderliste', 'Elenco canali', 'Lista de canais'],
    'Previous channel': ['Chaîne précédente', 'Canal anterior', 'Vorheriger Sender', 'Canale precedente', 'Canal anterior'],
    'Next channel': ['Chaîne suivante', 'Canal siguiente', 'Nächster Sender', 'Canale successivo', 'Canal seguinte'],
    'OK: watch · ◀ ▶: groups / channels · Back: close': ['OK : regarder · ◀ ▶ : groupes / chaînes · Retour : fermer', 'OK: ver · ◀ ▶: grupos / canales · Atrás: cerrar', 'OK: ansehen · ◀ ▶: Gruppen / Sender · Zurück: schließen', 'OK: guarda · ◀ ▶: gruppi / canali · Indietro: chiudi', 'OK: ver · ◀ ▶: grupos / canais · Voltar: fechar'],

    // details
    'Play': ['Lecture', 'Reproducir', 'Abspielen', 'Riproduci', 'Reproduzir'],
    'Pause': ['Pause', 'Pausa', 'Pause', 'Pausa', 'Pausa'],
    'Stop': ['Arrêter', 'Detener', 'Stopp', 'Interrompi', 'Parar'],
    'Rewind 30 seconds': ['Reculer de 30 secondes', 'Retroceder 30 segundos', '30 Sekunden zurück', 'Indietro di 30 secondi', 'Recuar 30 segundos'],
    'Forward 30 seconds': ['Avancer de 30 secondes', 'Avanzar 30 segundos', '30 Sekunden vor', 'Avanti di 30 secondi', 'Avançar 30 segundos'],
    'From start': ['Depuis le début', 'Desde el principio', 'Von Anfang an', 'Dall’inizio', 'Desde o início'],
    'Trailer': ['Bande-annonce', 'Tráiler', 'Trailer', 'Trailer', 'Trailer'],
    'Cast': ['Distribution', 'Reparto', 'Besetzung', 'Cast', 'Elenco'],
    'Director': ['Réalisateur', 'Director', 'Regie', 'Regista', 'Realizador'],
    'Versions': ['Versions', 'Versiones', 'Versionen', 'Versioni', 'Versões'],
    'Version': ['Version', 'Versión', 'Version', 'Versione', 'Versão'],
    'Showing': ['Affiché', 'Mostrando', 'Angezeigt', 'In vista', 'A mostrar'],
    'Episodes': ['Épisodes', 'Episodios', 'Folgen', 'Episodi', 'Episódios'],
    'No episodes available yet.': ['Aucun épisode disponible pour le moment.', 'Aún no hay episodios.', 'Noch keine Folgen verfügbar.', 'Nessun episodio disponibile.', 'Ainda não há episódios.'],
    'Start typing to search.': ['Tapez pour rechercher.', 'Escribe para buscar.', 'Tippe, um zu suchen.', 'Digita per cercare.', 'Escreva para pesquisar.'],
    'No results.': ['Aucun résultat.', 'Sin resultados.', 'Keine Ergebnisse.', 'Nessun risultato.', 'Sem resultados.'],
    'Search movies, series and channels': ['Rechercher films, séries et chaînes', 'Buscar películas, series y canales', 'Filme, Serien und Sender suchen', 'Cerca film, serie e canali', 'Pesquisar filmes, séries e canais'],

    // player
    'Can’t play this': ['Lecture impossible', 'No se puede reproducir', 'Wiedergabe nicht möglich', 'Impossibile riprodurre', 'Não é possível reproduzir'],
    'Open Settings': ['Ouvrir les paramètres', 'Abrir ajustes', 'Einstellungen öffnen', 'Apri impostazioni', 'Abrir definições'],
    'Copy link for VLC': ['Copier le lien pour VLC', 'Copiar enlace para VLC', 'Link für VLC kopieren', 'Copia link per VLC', 'Copiar link para VLC'],
    'Can’t open the player': ['Impossible d’ouvrir le lecteur', 'No se puede abrir el reproductor', 'Player kann nicht geöffnet werden', 'Impossibile aprire il lettore', 'Não é possível abrir o leitor'],

    // network
    'No network connection': ['Pas de connexion réseau', 'Sin conexión de red', 'Keine Netzwerkverbindung', 'Nessuna connessione di rete', 'Sem ligação à rede'],
    'Check your TV’s network settings. The app continues by itself when the connection is back.': ['Vérifiez les paramètres réseau du téléviseur. L’application reprendra d’elle-même au retour de la connexion.', 'Revisa los ajustes de red del televisor. La app continuará sola cuando vuelva la conexión.', 'Prüfe die Netzwerkeinstellungen des Fernsehers. Die App macht von selbst weiter, sobald die Verbindung zurück ist.', 'Controlla le impostazioni di rete della TV. L’app riprenderà da sola al ritorno della connessione.', 'Verifique as definições de rede da TV. A app continua sozinha quando a ligação voltar.'],
    'Connection restored': ['Connexion rétablie', 'Conexión restablecida', 'Verbindung wiederhergestellt', 'Connessione ripristinata', 'Ligação restabelecida'],

    // settings
    'Status': ['État', 'Estado', 'Status', 'Stato', 'Estado'],
    'Active': ['Actif', 'Activo', 'Aktiv', 'Attivo', 'Ativo'],
    'Expires': ['Expire le', 'Caduca', 'Läuft ab', 'Scade', 'Expira'],
    'Never': ['Jamais', 'Nunca', 'Nie', 'Mai', 'Nunca'],
    'Connections': ['Connexions', 'Conexiones', 'Verbindungen', 'Connessioni', 'Ligações'],
    'Server': ['Serveur', 'Servidor', 'Server', 'Server', 'Servidor'],
    'Playlist': ['Playlist', 'Lista', 'Playlist', 'Playlist', 'Lista'],
    'Playback': ['Lecture', 'Reproducción', 'Wiedergabe', 'Riproduzione', 'Reprodução'],
    'Live stream format': ['Format du direct', 'Formato del directo', 'Live-Stream-Format', 'Formato della diretta', 'Formato do direto'],
    'HLS works best in browsers; try MPEG-TS if a channel won’t start.': ['HLS fonctionne mieux ; essayez MPEG-TS si une chaîne ne démarre pas.', 'HLS funciona mejor; prueba MPEG-TS si un canal no arranca.', 'HLS funktioniert am besten; probiere MPEG-TS, wenn ein Sender nicht startet.', 'HLS funziona meglio; prova MPEG-TS se un canale non parte.', 'HLS funciona melhor; experimente MPEG-TS se um canal não arrancar.'],
    'Info language': ['Langue des infos', 'Idioma de la información', 'Sprache der Infos', 'Lingua delle informazioni', 'Idioma da informação'],
    'Language for summaries and titles from TMDB.': ['Langue des résumés et titres (TMDB).', 'Idioma de resúmenes y títulos (TMDB).', 'Sprache für Beschreibungen und Titel (TMDB).', 'Lingua di trame e titoli (TMDB).', 'Idioma das sinopses e títulos (TMDB).'],
    'Catch-up time correction': ['Correction de l’heure du replay', 'Corrección de hora de repetición', 'Zeitkorrektur für Wiederholungen', 'Correzione orario replay', 'Correção da hora da repetição'],
    'If replays start at the wrong time, shift them here.': ['Si les replays démarrent au mauvais moment, décalez-les ici.', 'Si las repeticiones empiezan a mala hora, ajústalas aquí.', 'Starten Wiederholungen zur falschen Zeit, verschiebe sie hier.', 'Se i replay iniziano all’ora sbagliata, spostali qui.', 'Se as repetições começarem à hora errada, ajuste aqui.'],
    'None (server time)': ['Aucune (heure du serveur)', 'Ninguna (hora del servidor)', 'Keine (Serverzeit)', 'Nessuna (ora del server)', 'Nenhuma (hora do servidor)'],
    'Show adult categories': ['Afficher les catégories adultes', 'Mostrar categorías para adultos', 'Erwachsenen-Kategorien zeigen', 'Mostra categorie per adulti', 'Mostrar categorias para adultos'],
    'Protected by your parental PIN. Hidden again each time the app starts.': ['Protégé par votre code parental. Masqué à nouveau à chaque démarrage.', 'Protegido con tu PIN parental. Se ocultan de nuevo al iniciar la app.', 'Durch deine Jugendschutz-PIN geschützt. Bei jedem Start wieder ausgeblendet.', 'Protetto dal PIN parentale. Nascoste di nuovo a ogni avvio.', 'Protegido pelo PIN parental. Ocultas de novo a cada arranque.'],
    'Parental PIN': ['Code parental', 'PIN parental', 'Jugendschutz-PIN', 'PIN parentale', 'PIN parental'],
    'Change PIN': ['Changer le code', 'Cambiar PIN', 'PIN ändern', 'Cambia PIN', 'Alterar PIN'],
    'Not set': ['Non défini', 'Sin definir', 'Nicht festgelegt', 'Non impostato', 'Não definido'],
    'Set': ['Défini', 'Definido', 'Festgelegt', 'Impostato', 'Definido'],
    'Create a 4-digit PIN': ['Créez un code à 4 chiffres', 'Crea un PIN de 4 cifras', 'Lege eine 4-stellige PIN fest', 'Crea un PIN di 4 cifre', 'Crie um PIN de 4 dígitos'],
    'Enter the PIN again': ['Saisissez à nouveau le code', 'Introduce el PIN otra vez', 'PIN wiederholen', 'Reinserisci il PIN', 'Introduza o PIN novamente'],
    'Enter your parental PIN': ['Saisissez votre code parental', 'Introduce tu PIN parental', 'Gib deine Jugendschutz-PIN ein', 'Inserisci il PIN parentale', 'Introduza o seu PIN parental'],
    'Enter your current PIN': ['Saisissez votre code actuel', 'Introduce tu PIN actual', 'Gib deine aktuelle PIN ein', 'Inserisci il PIN attuale', 'Introduza o PIN atual'],
    'Use the number keys or the keypad below.': ['Utilisez les touches numériques ou le pavé ci-dessous.', 'Usa las teclas numéricas o el teclado de abajo.', 'Nutze die Zifferntasten oder das Tastenfeld.', 'Usa i tasti numerici o il tastierino qui sotto.', 'Use as teclas numéricas ou o teclado abaixo.'],
    'Wrong PIN': ['Code incorrect', 'PIN incorrecto', 'Falsche PIN', 'PIN errato', 'PIN incorreto'],
    'The PINs don’t match': ['Les codes ne correspondent pas', 'Los PIN no coinciden', 'Die PINs stimmen nicht überein', 'I PIN non coincidono', 'Os PIN não coincidem'],
    'PIN saved': ['Code enregistré', 'PIN guardado', 'PIN gespeichert', 'PIN salvato', 'PIN guardado'],
    'Cancel': ['Annuler', 'Cancelar', 'Abbrechen', 'Annulla', 'Cancelar'],
    'Delete': ['Effacer', 'Borrar', 'Löschen', 'Cancella', 'Apagar'],
    'Playlist on this device': ['Playlist sur cet appareil', 'Lista en este dispositivo', 'Playlist auf diesem Gerät', 'Playlist su questo dispositivo', 'Lista neste dispositivo'],
    'Last updated': ['Dernière mise à jour', 'Última actualización', 'Zuletzt aktualisiert', 'Ultimo aggiornamento', 'Última atualização'],
    'Movies, series and channels are saved on this device so the app opens instantly. They refresh by themselves in the background every 6 hours.': ['Films, séries et chaînes sont enregistrés sur l’appareil pour une ouverture instantanée. Ils se mettent à jour seuls toutes les 6 heures.', 'Películas, series y canales se guardan en el dispositivo para abrir al instante. Se actualizan solos cada 6 horas.', 'Filme, Serien und Sender werden auf dem Gerät gespeichert, damit die App sofort startet. Sie aktualisieren sich alle 6 Stunden.', 'Film, serie e canali sono salvati sul dispositivo per aprire subito l’app. Si aggiornano da soli ogni 6 ore.', 'Filmes, séries e canais ficam guardados no dispositivo para abrir de imediato. Atualizam-se sozinhos a cada 6 horas.'],
    'Refresh now': ['Actualiser', 'Actualizar ahora', 'Jetzt aktualisieren', 'Aggiorna ora', 'Atualizar agora'],
    'Updating…': ['Mise à jour…', 'Actualizando…', 'Wird aktualisiert…', 'Aggiornamento…', 'A atualizar…'],
    'Couldn’t reach the server — keeping the saved playlist': ['Serveur injoignable — la playlist enregistrée est conservée', 'No se pudo conectar — se mantiene la lista guardada', 'Server nicht erreichbar — gespeicherte Playlist bleibt', 'Server non raggiungibile — resta la playlist salvata', 'Servidor inacessível — mantém-se a lista guardada'],
    'Playlist links': ['Liens de la playlist', 'Enlaces de la lista', 'Playlist-Links', 'Link della playlist', 'Links da lista'],
    'Clear Continue Watching': ['Effacer « Reprendre la lecture »', 'Borrar «Seguir viendo»', '„Weiterschauen“ leeren', 'Svuota «Continua a guardare»', 'Limpar «Continuar a ver»'],
    'Sign out': ['Se déconnecter', 'Cerrar sesión', 'Abmelden', 'Esci', 'Terminar sessão'],
    'Copied': ['Copié', 'Copiado', 'Kopiert', 'Copiato', 'Copiado'],
    'Cleared': ['Effacé', 'Borrado', 'Geleert', 'Svuotato', 'Limpo'],
    'Not saved yet': ['Pas encore enregistrée', 'Aún no guardada', 'Noch nicht gespeichert', 'Non ancora salvata', 'Ainda não guardada'],
    'Just now': ['À l’instant', 'Ahora mismo', 'Gerade eben', 'Proprio ora', 'Agora mesmo'],
    'Extra playlists': ['Playlists supplémentaires', 'Listas adicionales', 'Weitere Playlists', 'Playlist aggiuntive', 'Listas adicionais'],
    'Extra playlist': ['Playlist supplémentaire', 'Lista adicional', 'Weitere Playlist', 'Playlist aggiuntiva', 'Lista adicional'],
    'Add M3U playlists of your own, for example free TV channels. Each one shows as a group on top of Live TV and as a row on Home.': [
      'Ajoutez vos propres playlists M3U, par exemple des chaînes gratuites. Chacune apparaît comme un groupe en haut de la TV en direct et comme une rangée sur l’accueil.',
      'Añade tus propias listas M3U, por ejemplo canales gratuitos. Cada una aparece como un grupo arriba en TV en directo y como una fila en Inicio.',
      'Füge eigene M3U-Playlists hinzu, zum Beispiel kostenlose Sender. Jede erscheint als Gruppe oben im Live-TV und als Reihe auf der Startseite.',
      'Aggiungi le tue playlist M3U, ad esempio canali gratuiti. Ognuna appare come gruppo in cima alla TV in diretta e come riga nella Home.',
      'Adicione as suas listas M3U, por exemplo canais gratuitos. Cada uma aparece como um grupo no topo da TV em direto e como uma linha no Início.'],
    'Name': ['Nom', 'Nombre', 'Name', 'Nome', 'Nome'],
    'Add playlist': ['Ajouter la playlist', 'Añadir lista', 'Playlist hinzufügen', 'Aggiungi playlist', 'Adicionar lista'],
    'Add from phone': ['Ajouter depuis le téléphone', 'Añadir desde el móvil', 'Per Handy hinzufügen', 'Aggiungi dal telefono', 'Adicionar pelo telemóvel'],
    'No extra playlists yet.': ['Aucune playlist supplémentaire.', 'Aún no hay listas adicionales.', 'Noch keine weiteren Playlists.', 'Nessuna playlist aggiuntiva.', 'Ainda não há listas adicionais.'],
    'Checking the playlist…': ['Vérification de la playlist…', 'Comprobando la lista…', 'Playlist wird geprüft…', 'Verifica della playlist…', 'A verificar a lista…'],
    'Send an M3U playlist link from the phone.': ['Envoyez un lien de playlist M3U depuis le téléphone.', 'Envía un enlace de lista M3U desde el móvil.', 'Sende einen M3U-Playlist-Link vom Handy.', 'Invia un link di playlist M3U dal telefono.', 'Envie um link de lista M3U pelo telemóvel.'],
    'Your playlist': ['Votre playlist', 'Tu lista', 'Deine Playlist', 'La tua playlist', 'A sua lista'],
    'Remove': ['Supprimer', 'Quitar', 'Entfernen', 'Rimuovi', 'Remover'],
    'choose “Extra playlist” and enter this code:': ['choisissez « Playlist supplémentaire » et saisissez ce code :', 'elige «Lista adicional» e introduce este código:', 'wähle „Weitere Playlist“ und gib diesen Code ein:', 'scegli «Playlist aggiuntiva» e inserisci questo codice:', 'escolha «Lista adicional» e introduza este código:'],
    'Adds an M3U playlist next to the TV’s account (Settings → Extra playlists → Add from phone on the TV).': [
      'Ajoute une playlist M3U en plus du compte du téléviseur (sur le téléviseur : Paramètres → Playlists supplémentaires → Ajouter depuis le téléphone).',
      'Añade una lista M3U junto a la cuenta de la TV (en la TV: Ajustes → Listas adicionales → Añadir desde el móvil).',
      'Fügt eine M3U-Playlist zum Konto des Fernsehers hinzu (am Fernseher: Einstellungen → Weitere Playlists → Per Handy hinzufügen).',
      'Aggiunge una playlist M3U all’account della TV (sulla TV: Impostazioni → Playlist aggiuntive → Aggiungi dal telefono).',
      'Adiciona uma lista M3U à conta da TV (na TV: Definições → Listas adicionais → Adicionar pelo telemóvel).'],
    'Privacy policy': ['Politique de confidentialité', 'Política de privacidad', 'Datenschutzerklärung', 'Informativa sulla privacy', 'Política de privacidade'],
    // playlist languages
    'Choose your languages': ['Choisissez vos langues', 'Elige tus idiomas', 'Wähle deine Sprachen', 'Scegli le tue lingue', 'Escolha os seus idiomas'],
    'Only the languages you choose are downloaded and shown, which keeps the app fast. New channels, movies and series in them are added by themselves when the playlist updates.': [
      'Seules les langues choisies sont téléchargées et affichées, ce qui garde l’application rapide. Les nouvelles chaînes, films et séries dans ces langues s’ajoutent d’eux-mêmes à la mise à jour de la playlist.',
      'Solo se descargan y muestran los idiomas que elijas, así la app va rápida. Los nuevos canales, películas y series en esos idiomas se añaden solos cuando se actualiza la lista.',
      'Nur die gewählten Sprachen werden geladen und angezeigt, so bleibt die App schnell. Neue Sender, Filme und Serien in diesen Sprachen kommen beim Aktualisieren der Playlist von selbst dazu.',
      'Vengono scaricate e mostrate solo le lingue scelte, così l’app resta veloce. Nuovi canali, film e serie in quelle lingue si aggiungono da soli quando la playlist si aggiorna.',
      'Só os idiomas escolhidos são transferidos e mostrados, o que mantém a app rápida. Novos canais, filmes e séries nesses idiomas são adicionados sozinhos quando a lista é atualizada.'],
    'All languages': ['Toutes les langues', 'Todos los idiomas', 'Alle Sprachen', 'Tutte le lingue', 'Todos os idiomas'],
    'Save': ['Enregistrer', 'Guardar', 'Speichern', 'Salva', 'Guardar'],
    'Other': ['Autres', 'Otros', 'Sonstige', 'Altro', 'Outros'],
    'Choose at least one language, or All languages': ['Choisissez au moins une langue, ou Toutes les langues', 'Elige al menos un idioma, o Todos los idiomas', 'Wähle mindestens eine Sprache oder Alle Sprachen', 'Scegli almeno una lingua, o Tutte le lingue', 'Escolha pelo menos um idioma, ou Todos os idiomas'],
    'Can’t read the playlist. Check your connection.': ['Impossible de lire la playlist. Vérifiez votre connexion.', 'No se puede leer la lista. Revisa tu conexión.', 'Playlist kann nicht gelesen werden. Prüfe deine Verbindung.', 'Impossibile leggere la playlist. Controlla la connessione.', 'Não é possível ler a lista. Verifique a ligação.'],
    'Playlist languages': ['Langues de la playlist', 'Idiomas de la lista', 'Sprachen der Playlist', 'Lingue della playlist', 'Idiomas da lista'],
    'Shown': ['Affichées', 'Mostrados', 'Angezeigt', 'Mostrate', 'Mostrados'],
    'Only the chosen languages are downloaded and shown. New categories in them are added when the playlist updates.': [
      'Seules les langues choisies sont téléchargées et affichées. Les nouvelles catégories dans ces langues s’ajoutent à la mise à jour de la playlist.',
      'Solo se descargan y muestran los idiomas elegidos. Las nuevas categorías en esos idiomas se añaden al actualizar la lista.',
      'Nur die gewählten Sprachen werden geladen und angezeigt. Neue Kategorien darin kommen beim Aktualisieren der Playlist dazu.',
      'Vengono scaricate e mostrate solo le lingue scelte. Le nuove categorie in quelle lingue si aggiungono quando la playlist si aggiorna.',
      'Só os idiomas escolhidos são transferidos e mostrados. Novas categorias nesses idiomas são adicionadas quando a lista é atualizada.'],
    'Change languages': ['Changer de langues', 'Cambiar idiomas', 'Sprachen ändern', 'Cambia lingue', 'Mudar idiomas'],
    'Québec': ['Québec', 'Quebec', 'Québec', 'Québec', 'Quebeque'],
    'Scandinavia': ['Scandinavie', 'Escandinavia', 'Skandinavien', 'Scandinavia', 'Escandinávia'],
    'Ex-Yugoslavia': ['Ex-Yougoslavie', 'Ex-Yugoslavia', 'Ex-Jugoslawien', 'Ex-Jugoslavia', 'Ex-Jugoslávia'],
    'Asia': ['Asie', 'Asia', 'Asien', 'Asia', 'Ásia'],
    'Music': ['Musique', 'Música', 'Musik', 'Musica', 'Música'],
    'Africa': ['Afrique', 'África', 'Afrika', 'Africa', 'África'],
    'Latin America': ['Amérique latine', 'América Latina', 'Lateinamerika', 'America Latina', 'América Latina'],
    'Latvia / Latino': ['Lettonie / Latino', 'Letonia / Latino', 'Lettland / Latino', 'Lettonia / Latino', 'Letónia / Latino'],
    'Europe': ['Europe', 'Europa', 'Europa', 'Europa', 'Europa'],
    'International': ['International', 'Internacional', 'International', 'Internazionale', 'Internacional'],
    'Multi-language': ['Multilingue', 'Multilingüe', 'Mehrsprachig', 'Multilingua', 'Multilíngue'],
    'Sports': ['Sports', 'Deportes', 'Sport', 'Sport', 'Desporto'],
    'Programmes': ['Programmes', 'Programas', 'Sendungen', 'Programmi', 'Programas'],
    'OK: watch / replay · ▲ ▼: move · ◀: close': ['OK : regarder / revoir · ▲ ▼ : se déplacer · ◀ : fermer', 'OK: ver / repetición · ▲ ▼: moverse · ◀: cerrar', 'OK: ansehen / Wiederholung · ▲ ▼: bewegen · ◀: schließen', 'OK: guarda / replay · ▲ ▼: spostati · ◀: chiudi', 'OK: ver / repetir · ▲ ▼: mover · ◀: fechar'],
    'OK: watch · ◀ ▶: browse · ▲: all groups · ▼: close': ['OK : regarder · ◀ ▶ : parcourir · ▲ : tous les groupes · ▼ : fermer', 'OK: ver · ◀ ▶: explorar · ▲: todos los grupos · ▼: cerrar', 'OK: ansehen · ◀ ▶: blättern · ▲: alle Gruppen · ▼: schließen', 'OK: guarda · ◀ ▶: sfoglia · ▲: tutti i gruppi · ▼: chiudi', 'OK: ver · ◀ ▶: navegar · ▲: todos os grupos · ▼: fechar'],
    '⟲ Start over': ['⟲ Reprendre au début', '⟲ Desde el principio', '⟲ Von vorn', '⟲ Dall’inizio', '⟲ Desde o início'],
    '☰ Channels': ['☰ Chaînes', '☰ Canales', '☰ Sender', '☰ Canali', '☰ Canais'],
  };
  const P = [
    [/^Season (\d+)$/, ['Saison $1', 'Temporada $1', 'Staffel $1', 'Stagione $1', 'Temporada $1']],
    [/^Episode (\d+)$/, ['Épisode $1', 'Episodio $1', 'Folge $1', 'Episodio $1', 'Episódio $1']],
    [/^Resume · (.+) left$/, ['Reprendre · $1 restant', 'Reanudar · quedan $1', 'Fortsetzen · noch $1', 'Riprendi · mancano $1', 'Retomar · faltam $1']],
    [/^Resume S(\d+) · E(\d+)$/, ['Reprendre S$1 · É$2', 'Reanudar T$1 · E$2', 'Fortsetzen S$1 · F$2', 'Riprendi S$1 · E$2', 'Retomar T$1 · E$2']],
    [/^Play S(\d+) · E(\d+)$/, ['Lire S$1 · É$2', 'Reproducir T$1 · E$2', 'Abspielen S$1 · F$2', 'Riproduci S$1 · E$2', 'Reproduzir T$1 · E$2']],
    [/^(.*\d+(?:m| min)) left$/,['$1 restant', 'quedan $1', 'noch $1', 'mancano $1', 'faltam $1']],
    [/^(\d+) min ago$/, ['il y a $1 min', 'hace $1 min', 'vor $1 Min.', '$1 min fa', 'há $1 min']],
    [/^(\d+) hours? ago$/, ['il y a $1 h', 'hace $1 h', 'vor $1 Std.', '$1 ore fa', 'há $1 h']],
    [/^Playlist updated: (\d+) new, (\d+) removed, (\d+) changed$/, ['Playlist mise à jour : $1 nouveaux, $2 retirés, $3 modifiés', 'Lista actualizada: $1 nuevos, $2 eliminados, $3 cambiados', 'Playlist aktualisiert: $1 neu, $2 entfernt, $3 geändert', 'Playlist aggiornata: $1 nuovi, $2 rimossi, $3 modificati', 'Lista atualizada: $1 novos, $2 removidos, $3 alterados']],
    [/^Retrying in (\d+) s$/, ['Nouvel essai dans $1 s', 'Reintentando en $1 s', 'Neuer Versuch in $1 s', 'Nuovo tentativo tra $1 s', 'Nova tentativa em $1 s']],
    [/^VPN connected · (.+)$/, ['VPN connecté · $1', 'VPN conectada · $1', 'VPN verbunden · $1', 'VPN connessa · $1', 'VPN ligada · $1']],
    [/^Playlist added: (.+)$/, ['Playlist ajoutée : $1', 'Lista añadida: $1', 'Playlist hinzugefügt: $1', 'Playlist aggiunta: $1', 'Lista adicionada: $1']],
    [/^No channel (\d+)$/, ['Pas de chaîne $1', 'No hay canal $1', 'Kein Sender $1', 'Nessun canale $1', 'Sem canal $1']],
    [/^Keeps stopping · trying another copy \((.*)\)…$/, ['Coupures répétées · essai d’une autre copie ($1)…', 'Se corta a menudo · probando otra copia ($1)…', 'Stockt ständig · andere Kopie wird versucht ($1)…', 'Si interrompe spesso · provo un’altra copia ($1)…', 'Para muitas vezes · a tentar outra cópia ($1)…']],
    [/^(.+) starts today at (.+)$/, ['$1 commence aujourd’hui à $2', '$1 empieza hoy a las $2', '$1 beginnt heute um $2', '$1 inizia oggi alle $2', '$1 começa hoje às $2']],
    [/^(.+) starts tomorrow at (.+)$/, ['$1 commence demain à $2', '$1 empieza mañana a las $2', '$1 beginnt morgen um $2', '$1 inizia domani alle $2', '$1 começa amanhã às $2']],
    [/^(.+) starts (.+) at (.+)$/, ['$1 commence $2 à $3', '$1 empieza $2 a las $3', '$1 beginnt $2 um $3', '$1 inizia $2 alle $3', '$1 começa $2 às $3']],
    [/^([★☆]) Favorite$/, ['$1 Favori', '$1 Favorito', '$1 Favorit', '$1 Preferito', '$1 Favorito']],
    [/^Quality · (.+)$/, ['Qualité · $1', 'Calidad · $1', 'Qualität · $1', 'Qualità · $1', 'Qualidade · $1']],
    [/^Quality: (.+)$/, ['Qualité : $1', 'Calidad: $1', 'Qualität: $1', 'Qualità: $1', 'Qualidade: $1']],
  ];

  const one = s => {
    const t = D[s];
    if (t) return t[col];
    for (const [re, out] of P) if (re.test(s)) return s.replace(re, out[col]);
    return null;
  };
  window.T = s => one(s) || s;

  // Translate a text node / attribute, keeping its surrounding spaces.
  const text = node => {
    const v = node.nodeValue;
    const s = v.trim();
    if (!s || s.length > 220) return;
    const t = one(s);
    if (t && t !== s) node.nodeValue = v.replace(s, t);
  };
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const el = e => {
    for (const a of ATTRS) {
      const v = e.getAttribute(a);
      const t = v && one(v.trim());
      if (t && t !== v) e.setAttribute(a, t);
    }
  };
  const walk = root => {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
    el(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = it.nextNode(); n; n = it.nextNode()) n.nodeType === 3 ? text(n) : el(n);
  };

  document.documentElement.lang = lang;
  const start = () => {
    walk(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') text(m.target);
        else if (m.type === 'attributes') el(m.target);
        else m.addedNodes.forEach(walk);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
