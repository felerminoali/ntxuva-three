/**
 * Minimal internationalisation: Portuguese and English.
 *
 * - `t(key, params)` returns the string for the current language ({name} placeholders).
 * - Static HTML uses data attributes, applied by `applyTranslations()`:
 *   data-i18n (textContent), data-i18n-html (innerHTML), data-i18n-title, data-i18n-placeholder,
 *   data-i18n-aria (aria-label).
 */
const STORAGE_KEY = 'ntuxa.lang';
export const LANGUAGES = Object.freeze([
  { id: 'pt', name: 'Português' },
  { id: 'en', name: 'English' },
]);

const en = {
  'lang.label': 'Language',

  // Online
  'online.mode': 'Play online',
  'online.modeDesc': 'Find an opponent on the internet and stake coins in rooms across Mozambique.',
  'online.title': 'Online rooms',
  'online.connecting': 'Connecting to the server…',
  'online.offline': 'Cannot reach the game server. Check your connection (or start it with "npm run server").',
  'online.reconnecting': 'Connection lost — reconnecting…',
  'online.reconnected': 'Reconnected.',
  'online.retry': 'Retry',
  'online.playersOnline': '{n} players online',
  'online.captureRule': 'Capture rule for this game',
  'online.captureColumn': 'Column only (standard)',
  'online.captureExtra': 'Column + one extra bin of my choice',
  'online.captureNote': 'You are only matched with players who chose the same rule.',
  'online.stake': 'Stake',
  'online.pot': 'Pot',
  'online.minLevel': 'Level {n}+',
  'online.waiting': '{n} waiting',
  'online.playing': '{n} playing',
  'online.join': 'Play',
  'online.locked.coins': 'Not enough coins',
  'online.locked.level': 'Requires level {n}',
  'online.searching': 'Looking for an opponent',
  'online.searchingIn': 'Room: {place} ({province}) · stake {stake}',
  'online.searchingRule': 'Rule: {rule}',
  'online.cancel': 'Cancel',
  'online.matchFound': 'Opponent found: {name}!',
  'online.matchIn': 'Game in {place} · stake {stake} each · pot {pot}',
  'online.you': 'You',
  'online.opponent': 'Opponent',
  'online.yourMove': 'Your move',
  'online.theirMove': '{name} to move',
  'online.theirExtra': '{name} is choosing an extra bin',
  'online.clock': '{s}s',
  'online.autoMove': 'Time ran out — a random move was played.',
  'online.opponentAway': '{name} disconnected. They have {s} seconds to return.',
  'online.opponentBack': '{name} is back.',
  'online.resign': 'Resign',
  'online.resignConfirm': 'Resign this game? You will lose your stake.',
  'online.leaveConfirm': 'Leaving the game counts as resigning and you lose your stake. Leave?',
  'online.won': 'You win {coins} coins!',
  'online.lost': 'You lose your stake of {coins} coins.',
  'online.drawRefund': 'Draw — your stake of {coins} coins is returned.',
  'online.rating': 'Rating {delta}',
  'online.reason.captured-all': 'All seeds captured.',
  'online.reason.no-moves': 'No legal moves left.',
  'online.reason.resign': 'A player resigned.',
  'online.reason.timeout': 'A player ran out of time too often.',
  'online.reason.abandon': 'A player left the game.',
  'online.reason.move-limit': 'Move limit reached.',
  'online.playAgain': 'Play again in {place}',
  'online.notYourTurn': 'Wait for your opponent to move.',
  'online.resumed': 'You are back in your game.',

  // Account
  'account.signinTitle': 'Sign in to play online',
  'account.signinText': 'Your profile keeps your coins, level and results. Connect Facebook to keep it on every device.',
  'account.guestName': 'Player name',
  'account.guestPlaceholder': 'Your name',
  'account.playGuest': 'Play as guest',
  'account.legal':
    'By playing online you agree to the <a href="/term-of-use" target="_blank" rel="noopener">Terms of Use</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.',
  'account.facebook': 'Continue with Facebook',
  'account.facebookConnect': 'Connect Facebook',
  'account.facebookConnected': 'Connected to Facebook',
  'account.facebookUnavailable': 'Facebook login is not configured on this server.',
  'account.facebookFailed': 'Facebook login was cancelled or failed.',
  'account.signout': 'Sign out',
  'account.rename': 'Rename',
  'account.renamePrompt': 'New player name:',
  'account.level': 'Level {n}',
  'account.record': '{w} wins · {l} losses · rating {r}',
  'account.coins': 'coins',
  'account.dailyBonus': 'Daily bonus +{coins}',
  'account.bonusIn': 'Bonus in {h}h {m}m',
  'account.bonusClaimed': 'You received {coins} coins!',
  'account.store': 'Get coins',
  'account.leaderboard': 'Leaderboard',
  'account.welcome': 'Welcome, {name}! You start with {coins} coins.',

  // Store
  'store.title': 'Coin store',
  'store.note': 'Demo store: coins are free and purely virtual. They can never be exchanged for money.',
  'store.pack.saco': 'Bag of seeds',
  'store.pack.cesto': 'Basket',
  'store.pack.celeiro': 'Granary',
  'store.pack.bau': 'Chest',
  'store.pack.tesouro': 'Treasure',
  'store.get': 'Get (free)',
  'store.got': '+{coins} coins added.',
  'store.cooldown': 'Please wait a little before the next pack.',

  // Leaderboard
  'leaderboard.title': 'Richest players',
  'leaderboard.empty': 'No players yet.',

  // Errors from the server
  'error.not-enough-coins': 'You do not have enough coins for this room.',
  'error.level-too-low': 'Your level is too low for this room.',
  'error.in-game': 'You are already in a game.',
  'error.bonus-not-ready': 'The daily bonus is not ready yet.',
  'error.store-cooldown': 'Please wait a little before the next pack.',
  'error.not-your-turn': 'It is not your turn.',
  'error.rate-limited': 'Too many requests — slow down.',
  'error.bad-name': 'Choose a name with 2–24 characters.',
  'error.fb-disabled': 'Facebook login is not configured on this server.',
  'error.fb-invalid': 'Facebook could not confirm your login.',
  'error.generic': 'Something went wrong ({code}).',

  // Capture rule option (offline modes)
  'rule.extraCapture': 'Extra bin rule: after a capture, also take one opponent bin of your choice',
  'rule.extraShort': 'Column + extra bin',
  'rule.columnShort': 'Column only',

  // Scenarios
  'scenario.label': 'Scenery',
  'scenario.village': 'Village under the mango tree',
  'scenario.beach': 'Indian Ocean beach',
  'scenario.market': 'Maputo market at dusk',
  'scenario.savanna': 'Gorongosa savanna at sunset',
  'settings.music': 'Background music',

  // General
  'app.loading': 'Carving the board…',
  'app.stage': '3D game board',
  'common.back': 'Back',
  'common.start': 'Start',
  'common.mainMenu': 'Main menu',

  // Main menu
  'menu.subtitle': 'Ntxuva · the four-row mancala of Mozambique',
  'menu.play': 'Play',
  'menu.rules': 'Learn the Rules',
  'menu.settings': 'Settings',
  'menu.about': 'About',

  // Mode selection
  'play.title': 'Choose a game',
  'play.local': 'Two players',
  'play.localDesc': 'Take turns on the same device. South starts.',
  'play.ai': 'Against the computer',
  'play.difficulty': 'Difficulty',
  'play.easy': 'Easy',
  'play.medium': 'Medium',
  'play.hard': 'Hard',
  'play.youPlay': 'You play',
  'play.sideSouth': 'South (moves first)',
  'play.sideNorth': 'North (moves second)',
  'play.practice': 'Practice',
  'play.practiceDesc': 'Control both sides, preview every move and ask for hints. Undo freely.',
  'play.tutorial': 'Tutorial',
  'play.tutorialDesc': 'A guided, hands-on lesson on sowing, relays, captures and the endgame.',
  'play.boardSize': 'Board size:',
  'play.boardSizeHint': '(change it in Settings).',
  'play.sideSouthShort': 'South · 1st',
  'play.sideNorthShort': 'North · 2nd',

  // Lobby tiles and setup sheet
  'menu.guest': 'Guest',
  'menu.signinHint': 'Tap to sign in',
  'menu.rulesShort': 'Rules',
  'tile.online': 'Play online',
  'tile.onlineSub': '1 on 1 · win coins',
  'tile.ai': 'vs Computer',
  'tile.aiSub': 'Easy · Medium · Hard',
  'tile.local': '2 Players',
  'tile.localSub': 'Same device',
  'tile.practice': 'Practice',
  'tile.practiceSub': 'Hints & undo',
  'tile.tutorial': 'Tutorial',
  'tile.tutorialSub': 'Learn step by step',
  'tile.play': 'Play',
  'setup.aiDesc': 'Challenge the computer. Hard looks several moves ahead.',
  'setup.localDesc': 'Take turns on the same device. South starts.',
  'setup.practiceDesc': 'Control both sides, preview every move and ask for hints. Undo freely.',
  'end.winner': 'Winner',
  'store.popular': 'Popular',
  'store.best': 'Best value',
  'online.prize': 'Prize',
  'online.entry': 'Entry',
  'online.prevRoom': 'Previous room',
  'online.nextRoom': 'Next room',

  // Rules
  'rules.title': 'How to play Ntuxa',
  'rules.startTutorial': 'Start the interactive tutorial',
  'rules.html': `
          <h3>The board</h3>
          <p>The board has four rows of bins (4 × 16 by default; 4 × 8 up to 4 × 24 boards are traditional).
            Each player owns the two rows on their side: the <b>attacking row</b> in the middle of the board
            and the <b>back row</b> at the edge. At the start every bin holds <b>two seeds</b>. South moves first.</p>
          <h3>A turn</h3>
          <ol>
            <li>Choose one of your non-empty bins.</li>
            <li>Remove all the seeds from that bin.</li>
            <li>Drop them one by one into the following bins, <b>anti-clockwise</b>, around your own two rows.</li>
            <li>If the last seed lands in a bin that was <b>not empty</b>, pick up all the seeds in that bin and continue
              sowing (a <b>relay</b>). If it lands in an <b>empty</b> bin, the sowing ends.</li>
          </ol>
          <h3>Capturing</h3>
          <p>When the sowing ends in an empty bin of your <b>attacking row</b> and the facing bin in your opponent's
            <b>attacking row</b> (same column) has seeds, you capture all of their seeds in that column (both their
            attacking and back bins). Captured seeds are removed from the game.
            Ending in your back row, or facing an empty attacking bin, simply ends your turn, even if their back bin
            has seeds.</p>
          <p><b>Optional extra bin rule:</b> before a game you may choose to also take <b>one extra bin of your
            choice</b> from the opponent's side after every capture. Online, both players must pick the same rule.</p>
          <h3>Two phases</h3>
          <p><b>Phase one:</b> while you have any bin with more than one seed, you may not play a bin holding a single seed.</p>
          <p><b>Phase two:</b> once every non-empty bin on your side holds exactly one seed, you may play any single seed
            whose next bin is empty.</p>
          <h3>End of the game</h3>
          <p>You win by capturing all of your opponent's seeds.</p>
          <h3>Clarifications used in this version</h3>
          <ul>
            <li>A sowing long enough to go all the way around also drops a seed into the bin it started from.</li>
            <li>If a player still has seeds but no legal move (only possible in phase two when no single seed has an empty bin
              ahead of it), that player loses.</li>
            <li>A safety limit stops a single turn after 20,000 sown seeds, in case of an endless relay loop.</li>
            <li>An optional move limit (off by default) can end very long games; the player with more seeds then wins.</li>
          </ul>`,

  // Settings
  'settings.title': 'Settings',
  'settings.sound': 'Sound',
  'settings.soundEffects': 'Sound effects',
  'settings.volume': 'Volume',
  'settings.graphics': 'Graphics',
  'settings.quality': 'Quality',
  'settings.qualityLow': 'Low (no shadows, fastest)',
  'settings.qualityMedium': 'Medium',
  'settings.qualityHigh': 'High (sharp shadows)',
  'settings.animationSpeed': 'Animation speed',
  'settings.speedSlow': 'Slow',
  'settings.speedNormal': 'Normal',
  'settings.speedFast': 'Fast',
  'settings.speedVeryFast': 'Very fast',
  'settings.showCounts': 'Show seed counts on the board',
  'settings.showHints': 'Highlight playable bins',
  'settings.cameraFollow': 'Turn the view toward the player to move (two-player mode)',
  'settings.game': 'Game (applies to new games)',
  'settings.boardSize': 'Board size',
  'settings.size8': '4 × 8 (32 bins)',
  'settings.size9': '4 × 9 (36 bins)',
  'settings.size12': '4 × 12 (48 bins)',
  'settings.size13': '4 × 13 (52 bins)',
  'settings.size15': '4 × 15 (60 bins)',
  'settings.size16': '4 × 16 (64 bins)',
  'settings.size24': '4 × 24 (96 bins)',
  'settings.moveLimit': 'Optional move limit (house rule)',
  'settings.moveLimitOff': 'Off — play until all seeds are captured',
  'settings.moveLimit200': '200 turns, then most seeds wins',
  'settings.moveLimit400': '400 turns, then most seeds wins',

  // About
  'about.title': 'About Ntuxa',
  'about.html': `<p><b>Ntxuva</b> is a traditional mancala game from Mozambique and belongs to the four-row
          ("Mancala IV") family that is believed to have originated in East Africa, alongside games such as
          Bao (Zanzibar), Igisoro (Rwanda) and Omweso (Uganda). It is called <i>Ntxuva</i> in the south of Mozambique and
          <i>Mthadje</i> or <i>M'pale</i> in the north.</p>
        <p>It is played on carved wooden boards, or in holes dug in the ground, with seeds or small stones. Boards
          range from 4 × 8 to 4 × 24 bins and are always split evenly between the two players.</p>
        <p>This version is built with Three.js and runs entirely in your browser. All graphics and sounds are generated
          in code. The rules follow the description provided for this project. See <i>Learn the Rules</i> for the details
          used where traditions differ.</p>`,
  'about.controlsTitle': 'Controls',
  'about.privacy': 'Privacy Policy',
  'about.terms': 'Terms of Use',
  'about.controls': `
          <li><b>Click / tap</b> a bin to play it.</li>
          <li><b>Drag</b> to orbit, <b>scroll / pinch</b> to zoom, <b>right-drag / two fingers</b> to pan.</li>
          <li><b>Arrow keys</b> move the keyboard cursor, <b>Enter</b> plays the bin.</li>
          <li><b>Space</b> or a click during an animation fast-forwards it.</li>
          <li><b>U</b> or <b>Ctrl+Z</b> undo · <b>H</b> hint (practice) · <b>C</b> reset the camera · <b>Esc</b> pause.</li>`,

  // In-game HUD
  'hud.pause': 'Pause',
  'hud.pauseTitle': 'Pause (Esc)',
  'hud.seeds': 'seeds',
  'hud.captured': 'captured',
  'hud.capturedTitle': 'Captured seeds (score)',
  'hud.seedsOnBoard': 'Seeds on the board',
  'hud.turnChip': 'Turn',
  'hud.playerInfo': 'Player info',
  'hud.vsComputer': 'vs computer',
  'hud.badgeYou': 'You',
  'hud.badgeAi': 'AI',
  'hud.side': 'Side',
  'hud.sideSouth': 'South · bottom rows',
  'hud.sideNorth': 'North · top rows',
  'hud.bins': 'Bins with seeds',
  'hud.phase': 'Phase',
  'hud.phase1': '1 · sow the big bins first',
  'hud.phase2': '2 · single seeds',
  'hud.difficulty': 'Difficulty',
  'hud.level': 'Level',
  'hud.rating': 'Rating',
  'hud.record': 'Wins / games',
  'hud.stake': 'Stake',
  'hud.extraRule': 'Capture rule',
  'hud.ruleColumn': 'column only',
  'hud.ruleExtra': 'column + 1 extra bin',
  'hud.facebook': 'Facebook profile',
  'hud.yes': 'yes',
  'common.close': 'Close',
  'hud.history': 'Move history',
  'hud.noMoves': 'No moves yet.',
  'hud.undo': '↶ Undo',
  'hud.undoTitle': 'Undo (U)',
  'hud.hint': '💡 Hint',
  'hud.hintTitle': 'Hint (H)',
  'hud.skip': '⏩ Skip',
  'hud.skipTitle': 'Skip animation (Space)',
  'hud.camera': '⟲ View',
  'hud.cameraTitle': 'Reset camera (C)',

  // Pause and end screens
  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.restart': 'Restart',
  'pause.rules': 'Rules',
  'end.playAgain': 'Play again',
  'end.viewBoard': 'View the board',
  'end.capturedAll': '{winner} captured all of {loser}’s seeds after {turns} turns.',
  'end.noMoves': '{loser} still had seeds but no legal move.',
  'end.moveLimit': 'The move limit was reached. South {south} – North {north} seeds.',
  'end.captured': 'Captured: South {south}, North {north}.',

  // Players and results
  'player.south': 'South',
  'player.north': 'North',
  'player.you': 'You ({side})',
  'player.computer': 'Computer ({side})',
  'result.draw': 'Draw',
  'result.youWin': 'You win!',
  'result.wins': '{name} wins!',
  'result.computerWins': 'The computer wins',

  // Turn flow messages
  'game.turn': 'Turn {n}',
  'game.phaseTwo': '<b>Phase two:</b> a single seed may only move into an empty bin',
  'game.hoverPreview': 'Hover over a bin to preview its move',
  'game.chooseExtraInfo': '<b>Capture!</b> Choose one extra bin from your opponent’s side (ringed in red).',
  'game.thinking': '{name} is thinking',
  'game.tutorial': 'Tutorial',
  'game.chooseExtraTurn': '{name}: choose an extra bin',
  'game.yourMove': 'Your move',
  'game.toMove': '{name} to move',
  'game.computerThinking': 'The computer is thinking…',
  'game.waitComputer': 'Please wait for the computer to move.',
  'game.chooseExtraError': 'Choose one of your opponent’s bins ringed in red as your extra capture.',
  'game.notYourBin': 'That bin belongs to {name}. Play from your own two rows.',
  'game.skipInfo': 'Click or press Space to skip the animation.',
  'game.takesExtra.one': '{name} takes extra bin {bin} ({n} seed).',
  'game.takesExtra.other': '{name} takes extra bin {bin} ({n} seeds).',
  'game.capturedChoose.one': 'Captured {n} seed! Now choose an extra bin.',
  'game.capturedChoose.other': 'Captured {n} seeds! Now choose an extra bin.',
  'game.capturedBy.one': '{name} captured {n} seed{extra}.',
  'game.capturedBy.other': '{name} captured {n} seeds{extra}.',
  'game.includingExtra': ' including extra bin {bin}',
  'game.loopLimit': 'Relay safety limit reached — the turn ends.',
  'game.aiNoMove': 'The computer could not find a move.',
  'game.hintThinking': 'Thinking about a good move…',
  'game.hintResult': 'Suggestion: play <b>{bin}</b> (cyan ring).',
  'game.nothingToUndo': 'Nothing to undo.',
  'game.overInfo': 'Game over — use the ❚❚ button to restart or return to the menu.',

  // Illegal moves (codes from validateMove)
  'move.game-over': 'The game is over.',
  'move.awaiting-extra': 'Choose an extra opponent bin to capture first.',
  'move.not-a-bin': 'That is not one of your bins.',
  'move.empty': 'That bin is empty.',
  'move.phase-one-single': 'While you have a bin with more than one seed, you cannot play a single seed.',
  'move.next-not-empty': 'In phase two a single seed may only be played into an empty next bin.',

  // Practice preview
  'preview.sows.one': '<b>{bin}</b>: sows {n} seed',
  'preview.sows.other': '<b>{bin}</b>: sows {n} seeds',
  'preview.ends': ', ends in {bin} (blue ring)',
  'preview.captures': ' — <b>captures {n}</b>',
  'preview.plusExtra': ' + an extra bin',
  'preview.wins': ' — <b>wins the game!</b>',

  // Move history
  'history.sown': '{who} {label}: {n} sown',
  'history.relays.one': ', {n} relay',
  'history.relays.other': ', {n} relays',
  'history.ends': ', ends {bin}',
  'history.captures': ' — captures {n}',
  'history.extra': ' (extra {bin})',
  'history.loopLimit': ' (loop limit)',

  // Tutorial panel
  'tutorial.step': 'Step {n} of {total}',
  'tutorial.retry': 'Retry',
  'tutorial.next': 'Next',
  'tutorial.finish': 'Finish',
  'tutorial.exit': 'Exit tutorial',
  'tutorial.wellDone': 'Well done!',
  'tutorial.stepComplete': 'Step complete — press <b>Next</b> to continue or <b>Retry</b> to try again.',
  'tutorial.playHighlighted': 'For this step, play the highlighted bin.',
  'tutorial.complete': 'Tutorial complete. Enjoy the game!',
};

const pt = {
  'lang.label': 'Idioma',

  'online.mode': 'Jogar online',
  'online.modeDesc': 'Encontre um adversário na internet e aposte moedas em salas por todo Moçambique.',
  'online.title': 'Salas online',
  'online.connecting': 'A ligar ao servidor…',
  'online.offline': 'Não foi possível contactar o servidor do jogo. Verifique a ligação (ou inicie-o com "npm run server").',
  'online.reconnecting': 'Ligação perdida — a religar…',
  'online.reconnected': 'Ligação restabelecida.',
  'online.retry': 'Tentar de novo',
  'online.playersOnline': '{n} jogadores online',
  'online.captureRule': 'Regra de captura deste jogo',
  'online.captureColumn': 'Só a coluna (padrão)',
  'online.captureExtra': 'Coluna + uma casa extra à minha escolha',
  'online.captureNote': 'Só joga contra adversários que escolheram a mesma regra.',
  'online.stake': 'Aposta',
  'online.pot': 'Prémio',
  'online.minLevel': 'Nível {n}+',
  'online.waiting': '{n} à espera',
  'online.playing': '{n} a jogar',
  'online.join': 'Jogar',
  'online.locked.coins': 'Moedas insuficientes',
  'online.locked.level': 'Requer nível {n}',
  'online.searching': 'À procura de um adversário',
  'online.searchingIn': 'Sala: {place} ({province}) · aposta {stake}',
  'online.searchingRule': 'Regra: {rule}',
  'online.cancel': 'Cancelar',
  'online.matchFound': 'Adversário encontrado: {name}!',
  'online.matchIn': 'Jogo em {place} · aposta {stake} cada · prémio {pot}',
  'online.you': 'Você',
  'online.opponent': 'Adversário',
  'online.yourMove': 'A sua vez',
  'online.theirMove': 'Vez de {name}',
  'online.theirExtra': '{name} está a escolher uma casa extra',
  'online.clock': '{s}s',
  'online.autoMove': 'O tempo acabou — foi jogada uma jogada aleatória.',
  'online.opponentAway': '{name} desligou-se. Tem {s} segundos para voltar.',
  'online.opponentBack': '{name} voltou.',
  'online.resign': 'Desistir',
  'online.resignConfirm': 'Desistir deste jogo? Perderá a sua aposta.',
  'online.leaveConfirm': 'Sair do jogo conta como desistência e perde a aposta. Sair?',
  'online.won': 'Ganhou {coins} moedas!',
  'online.lost': 'Perdeu a sua aposta de {coins} moedas.',
  'online.drawRefund': 'Empate — a sua aposta de {coins} moedas foi devolvida.',
  'online.rating': 'Classificação {delta}',
  'online.reason.captured-all': 'Todas as sementes foram capturadas.',
  'online.reason.no-moves': 'Sem jogadas legais.',
  'online.reason.resign': 'Um jogador desistiu.',
  'online.reason.timeout': 'Um jogador esgotou o tempo demasiadas vezes.',
  'online.reason.abandon': 'Um jogador abandonou o jogo.',
  'online.reason.move-limit': 'Limite de jogadas atingido.',
  'online.playAgain': 'Jogar de novo em {place}',
  'online.notYourTurn': 'Aguarde a jogada do adversário.',
  'online.resumed': 'Voltou ao seu jogo.',

  'account.signinTitle': 'Entre para jogar online',
  'account.signinText': 'O seu perfil guarda as moedas, o nível e os resultados. Ligue o Facebook para o manter em qualquer dispositivo.',
  'account.guestName': 'Nome do jogador',
  'account.guestPlaceholder': 'O seu nome',
  'account.playGuest': 'Jogar como convidado',
  'account.legal':
    'Ao jogar online aceita os <a href="/term-of-use#pt" target="_blank" rel="noopener">Termos de Utilização</a> e a <a href="/privacy#pt" target="_blank" rel="noopener">Política de Privacidade</a>.',
  'account.facebook': 'Continuar com o Facebook',
  'account.facebookConnect': 'Ligar ao Facebook',
  'account.facebookConnected': 'Ligado ao Facebook',
  'account.facebookUnavailable': 'O login com Facebook não está configurado neste servidor.',
  'account.facebookFailed': 'O login com Facebook foi cancelado ou falhou.',
  'account.signout': 'Sair',
  'account.rename': 'Mudar nome',
  'account.renamePrompt': 'Novo nome do jogador:',
  'account.level': 'Nível {n}',
  'account.record': '{w} vitórias · {l} derrotas · classificação {r}',
  'account.coins': 'moedas',
  'account.dailyBonus': 'Bónus diário +{coins}',
  'account.bonusIn': 'Bónus em {h}h {m}m',
  'account.bonusClaimed': 'Recebeu {coins} moedas!',
  'account.store': 'Obter moedas',
  'account.leaderboard': 'Classificação',
  'account.welcome': 'Bem-vindo(a), {name}! Começa com {coins} moedas.',

  'store.title': 'Loja de moedas',
  'store.note': 'Loja de demonstração: as moedas são gratuitas e apenas virtuais. Nunca podem ser trocadas por dinheiro.',
  'store.pack.saco': 'Saco de sementes',
  'store.pack.cesto': 'Cesto',
  'store.pack.celeiro': 'Celeiro',
  'store.pack.bau': 'Baú',
  'store.pack.tesouro': 'Tesouro',
  'store.get': 'Obter (grátis)',
  'store.got': '+{coins} moedas adicionadas.',
  'store.cooldown': 'Aguarde um pouco antes do próximo pacote.',

  'leaderboard.title': 'Jogadores mais ricos',
  'leaderboard.empty': 'Ainda não há jogadores.',

  'error.not-enough-coins': 'Não tem moedas suficientes para esta sala.',
  'error.level-too-low': 'O seu nível é demasiado baixo para esta sala.',
  'error.in-game': 'Já está num jogo.',
  'error.bonus-not-ready': 'O bónus diário ainda não está disponível.',
  'error.store-cooldown': 'Aguarde um pouco antes do próximo pacote.',
  'error.not-your-turn': 'Não é a sua vez.',
  'error.rate-limited': 'Demasiados pedidos — mais devagar.',
  'error.bad-name': 'Escolha um nome com 2 a 24 caracteres.',
  'error.fb-disabled': 'O login com Facebook não está configurado neste servidor.',
  'error.fb-invalid': 'O Facebook não confirmou o seu login.',
  'error.generic': 'Algo correu mal ({code}).',

  'rule.extraCapture': 'Regra da casa extra: após uma captura, leva também uma casa do adversário à sua escolha',
  'rule.extraShort': 'Coluna + casa extra',
  'rule.columnShort': 'Só a coluna',

  'scenario.label': 'Cenário',
  'scenario.village': 'Aldeia debaixo da mangueira',
  'scenario.beach': 'Praia do Índico',
  'scenario.market': 'Mercado de Maputo ao entardecer',
  'scenario.savanna': 'Savana da Gorongosa ao pôr do sol',
  'settings.music': 'Música de fundo',

  'app.loading': 'A esculpir o tabuleiro…',
  'app.stage': 'Tabuleiro de jogo 3D',
  'common.back': 'Voltar',
  'common.start': 'Começar',
  'common.mainMenu': 'Menu principal',

  'menu.subtitle': 'Ntxuva · o mancala de quatro filas de Moçambique',
  'menu.play': 'Jogar',
  'menu.rules': 'Aprender as regras',
  'menu.settings': 'Definições',
  'menu.about': 'Sobre',

  'play.title': 'Escolha um jogo',
  'play.local': 'Jogo local',
  'play.localDesc': 'Dois jogadores jogam à vez no mesmo dispositivo. O Sul começa.',
  'play.ai': 'Contra o computador',
  'play.difficulty': 'Dificuldade',
  'play.easy': 'Fácil',
  'play.medium': 'Média',
  'play.hard': 'Difícil',
  'play.youPlay': 'Joga com',
  'play.sideSouth': 'Sul (joga primeiro)',
  'play.sideNorth': 'Norte (joga em segundo)',
  'play.practice': 'Prática',
  'play.practiceDesc': 'Controle os dois lados, veja a antevisão de cada jogada e peça dicas. Desfaça à vontade.',
  'play.tutorial': 'Tutorial',
  'play.tutorialDesc': 'Uma lição guiada e prática sobre semear, continuar a semear, capturar e o fim do jogo.',
  'play.boardSize': 'Tamanho do tabuleiro:',
  'play.boardSizeHint': '(altere-o nas Definições).',
  'play.sideSouthShort': 'Sul · 1.º',
  'play.sideNorthShort': 'Norte · 2.º',

  'menu.guest': 'Convidado',
  'menu.signinHint': 'Toque para entrar',
  'menu.rulesShort': 'Regras',
  'tile.online': 'Jogar online',
  'tile.onlineSub': '1 contra 1 · ganhe moedas',
  'tile.ai': 'vs Computador',
  'tile.aiSub': 'Fácil · Média · Difícil',
  'tile.local': '2 Jogadores',
  'tile.localSub': 'Mesmo dispositivo',
  'tile.practice': 'Prática',
  'tile.practiceSub': 'Dicas e desfazer',
  'tile.tutorial': 'Tutorial',
  'tile.tutorialSub': 'Aprenda passo a passo',
  'tile.play': 'Jogar',
  'setup.aiDesc': 'Desafie o computador. O nível Difícil pensa várias jogadas à frente.',
  'setup.localDesc': 'Dois jogadores jogam à vez no mesmo dispositivo. O Sul começa.',
  'setup.practiceDesc': 'Controle os dois lados, veja a antevisão de cada jogada e peça dicas. Desfaça à vontade.',
  'end.winner': 'Vencedor',
  'store.popular': 'Popular',
  'store.best': 'Melhor valor',
  'online.prize': 'Prémio',
  'online.entry': 'Entrada',
  'online.prevRoom': 'Sala anterior',
  'online.nextRoom': 'Sala seguinte',

  'rules.title': 'Como jogar Ntuxa',
  'rules.startTutorial': 'Começar o tutorial interativo',
  'rules.html': `
          <h3>O tabuleiro</h3>
          <p>O tabuleiro tem quatro filas de casas (4 × 16 por omissão; os tabuleiros tradicionais vão de 4 × 8 a 4 × 24).
            Cada jogador é dono das duas filas do seu lado: a <b>fila de ataque</b>, no meio do tabuleiro,
            e a <b>fila de trás</b>, na borda. No início, cada casa tem <b>duas sementes</b>. O Sul joga primeiro.</p>
          <h3>Uma jogada</h3>
          <ol>
            <li>Escolha uma das suas casas que não esteja vazia.</li>
            <li>Tire todas as sementes dessa casa.</li>
            <li>Deixe-as cair uma a uma nas casas seguintes, no <b>sentido contrário ao dos ponteiros do relógio</b>, à volta das suas duas filas.</li>
            <li>Se a última semente cair numa casa que <b>não estava vazia</b>, apanhe todas as sementes dessa casa e continue
              a semear (uma <b>continuação</b>). Se cair numa casa <b>vazia</b>, a sementeira termina.</li>
          </ol>
          <h3>Capturar</h3>
          <p>Quando a sementeira termina numa casa vazia da sua <b>fila de ataque</b> e a casa em frente, na <b>fila de
            ataque</b> do adversário (mesma coluna), tem sementes, captura todas as sementes dele nessa coluna (tanto
            da casa de ataque como da casa de trás). As sementes capturadas saem do jogo.
            Terminar na fila de trás, ou em frente a uma casa de ataque vazia, apenas encerra a sua vez, mesmo que a
            casa de trás dele tenha sementes.</p>
          <p><b>Regra opcional da casa extra:</b> antes do jogo pode escolher levar também <b>uma casa extra à sua
            escolha</b> do lado do adversário após cada captura. Online, os dois jogadores têm de escolher a mesma regra.</p>
          <h3>Duas fases</h3>
          <p><b>Primeira fase:</b> enquanto tiver alguma casa com mais de uma semente, não pode jogar uma casa com uma só semente.</p>
          <p><b>Segunda fase:</b> quando todas as casas não vazias do seu lado tiverem exatamente uma semente, pode jogar qualquer
            semente sozinha cuja casa seguinte esteja vazia.</p>
          <h3>Fim do jogo</h3>
          <p>Ganha quem capturar todas as sementes do adversário.</p>
          <h3>Esclarecimentos usados nesta versão</h3>
          <ul>
            <li>Uma sementeira suficientemente longa para dar a volta completa também deixa uma semente na casa de onde partiu.</li>
            <li>Se um jogador ainda tiver sementes mas nenhuma jogada legal (só é possível na segunda fase, quando nenhuma semente
              sozinha tem uma casa vazia à frente), esse jogador perde.</li>
            <li>Um limite de segurança termina a vez após 20 000 sementes semeadas, para evitar continuações sem fim.</li>
            <li>Um limite de jogadas opcional (desligado por omissão) pode terminar jogos muito longos; ganha então quem tiver mais sementes.</li>
          </ul>`,

  'settings.title': 'Definições',
  'settings.sound': 'Som',
  'settings.soundEffects': 'Efeitos sonoros',
  'settings.volume': 'Volume',
  'settings.graphics': 'Gráficos',
  'settings.quality': 'Qualidade',
  'settings.qualityLow': 'Baixa (sem sombras, mais rápida)',
  'settings.qualityMedium': 'Média',
  'settings.qualityHigh': 'Alta (sombras nítidas)',
  'settings.animationSpeed': 'Velocidade da animação',
  'settings.speedSlow': 'Lenta',
  'settings.speedNormal': 'Normal',
  'settings.speedFast': 'Rápida',
  'settings.speedVeryFast': 'Muito rápida',
  'settings.showCounts': 'Mostrar o número de sementes no tabuleiro',
  'settings.showHints': 'Destacar as casas jogáveis',
  'settings.cameraFollow': 'Virar a vista para o jogador da vez (jogo local)',
  'settings.game': 'Jogo (aplica-se a novos jogos)',
  'settings.boardSize': 'Tamanho do tabuleiro',
  'settings.size8': '4 × 8 (32 casas)',
  'settings.size9': '4 × 9 (36 casas)',
  'settings.size12': '4 × 12 (48 casas)',
  'settings.size13': '4 × 13 (52 casas)',
  'settings.size15': '4 × 15 (60 casas)',
  'settings.size16': '4 × 16 (64 casas)',
  'settings.size24': '4 × 24 (96 casas)',
  'settings.moveLimit': 'Limite de jogadas opcional (regra caseira)',
  'settings.moveLimitOff': 'Desligado — jogar até todas as sementes serem capturadas',
  'settings.moveLimit200': '200 turnos; depois ganha quem tiver mais sementes',
  'settings.moveLimit400': '400 turnos; depois ganha quem tiver mais sementes',

  'about.title': 'Sobre o Ntuxa',
  'about.html': `<p>O <b>Ntxuva</b> é um jogo tradicional de mancala de Moçambique e pertence à família de quatro filas
          ("Mancala IV"), que se julga ter origem na África Oriental, tal como jogos como o
          Bao (Zanzibar), o Igisoro (Ruanda) e o Omweso (Uganda). Chama-se <i>Ntxuva</i> no sul de Moçambique e
          <i>Mthadje</i> ou <i>M'pale</i> no norte.</p>
        <p>Joga-se em tabuleiros de madeira esculpida, ou em buracos cavados no chão, com sementes ou pequenas pedras. Os tabuleiros
          vão de 4 × 8 a 4 × 24 casas e são sempre divididos em partes iguais entre os dois jogadores.</p>
        <p>Esta versão foi feita com Three.js e corre inteiramente no seu navegador. Todos os gráficos e sons são gerados
          por código. As regras seguem a descrição fornecida para este projeto. Consulte <i>Aprender as regras</i> para os pormenores
          adotados onde as tradições diferem.</p>`,
  'about.controlsTitle': 'Controlos',
  'about.privacy': 'Política de Privacidade',
  'about.terms': 'Termos de Utilização',
  'about.controls': `
          <li><b>Clique / toque</b> numa casa para a jogar.</li>
          <li><b>Arraste</b> para rodar a vista, <b>roda do rato / beliscar</b> para fazer zoom, <b>arrastar com o botão direito / dois dedos</b> para deslocar.</li>
          <li>As <b>setas</b> movem o cursor do teclado e <b>Enter</b> joga a casa.</li>
          <li><b>Espaço</b> ou um clique durante uma animação acelera-a.</li>
          <li><b>U</b> ou <b>Ctrl+Z</b> desfazer · <b>H</b> dica (prática) · <b>C</b> repor a câmara · <b>Esc</b> pausa.</li>`,

  'hud.pause': 'Pausa',
  'hud.pauseTitle': 'Pausa (Esc)',
  'hud.seeds': 'sementes',
  'hud.captured': 'capturadas',
  'hud.capturedTitle': 'Sementes capturadas (pontuação)',
  'hud.seedsOnBoard': 'Sementes no tabuleiro',
  'hud.turnChip': 'Vez',
  'hud.playerInfo': 'Informação do jogador',
  'hud.vsComputer': 'contra o computador',
  'hud.badgeYou': 'Você',
  'hud.badgeAi': 'IA',
  'hud.side': 'Lado',
  'hud.sideSouth': 'Sul · filas de baixo',
  'hud.sideNorth': 'Norte · filas de cima',
  'hud.bins': 'Casas com sementes',
  'hud.phase': 'Fase',
  'hud.phase1': '1 · jogar primeiro as casas grandes',
  'hud.phase2': '2 · sementes soltas',
  'hud.difficulty': 'Dificuldade',
  'hud.level': 'Nível',
  'hud.rating': 'Classificação',
  'hud.record': 'Vitórias / jogos',
  'hud.stake': 'Aposta',
  'hud.extraRule': 'Regra de captura',
  'hud.ruleColumn': 'só a coluna',
  'hud.ruleExtra': 'coluna + 1 casa extra',
  'hud.facebook': 'Perfil do Facebook',
  'hud.yes': 'sim',
  'common.close': 'Fechar',
  'hud.history': 'Histórico de jogadas',
  'hud.noMoves': 'Ainda não há jogadas.',
  'hud.undo': '↶ Desfazer',
  'hud.undoTitle': 'Desfazer (U)',
  'hud.hint': '💡 Dica',
  'hud.hintTitle': 'Dica (H)',
  'hud.skip': '⏩ Saltar',
  'hud.skipTitle': 'Saltar a animação (Espaço)',
  'hud.camera': '⟲ Vista',
  'hud.cameraTitle': 'Repor a câmara (C)',

  'pause.title': 'Pausa',
  'pause.resume': 'Retomar',
  'pause.restart': 'Recomeçar',
  'pause.rules': 'Regras',
  'end.playAgain': 'Jogar de novo',
  'end.viewBoard': 'Ver o tabuleiro',
  'end.capturedAll': '{winner} capturou todas as sementes de {loser} em {turns} turnos.',
  'end.noMoves': '{loser} ainda tinha sementes mas nenhuma jogada legal.',
  'end.moveLimit': 'Foi atingido o limite de jogadas. Sul {south} – Norte {north} sementes.',
  'end.captured': 'Capturadas: Sul {south}, Norte {north}.',

  'player.south': 'Sul',
  'player.north': 'Norte',
  'player.you': 'Você ({side})',
  'player.computer': 'Computador ({side})',
  'result.draw': 'Empate',
  'result.youWin': 'Ganhou!',
  'result.wins': '{name} ganha!',
  'result.computerWins': 'O computador ganha',

  'game.turn': 'Turno {n}',
  'game.phaseTwo': '<b>Segunda fase:</b> uma semente sozinha só pode avançar para uma casa vazia',
  'game.hoverPreview': 'Passe o cursor sobre uma casa para ver a jogada',
  'game.chooseExtraInfo': '<b>Captura!</b> Escolha uma casa extra do lado do adversário (com anel vermelho).',
  'game.thinking': '{name} está a pensar',
  'game.tutorial': 'Tutorial',
  'game.chooseExtraTurn': '{name}: escolha uma casa extra',
  'game.yourMove': 'A sua vez',
  'game.toMove': 'Vez de {name}',
  'game.computerThinking': 'O computador está a pensar…',
  'game.waitComputer': 'Aguarde a jogada do computador.',
  'game.chooseExtraError': 'Escolha uma das casas do adversário com anel vermelho como captura extra.',
  'game.notYourBin': 'Essa casa pertence a {name}. Jogue nas suas duas filas.',
  'game.skipInfo': 'Clique ou carregue em Espaço para saltar a animação.',
  'game.takesExtra.one': '{name} leva a casa extra {bin} ({n} semente).',
  'game.takesExtra.other': '{name} leva a casa extra {bin} ({n} sementes).',
  'game.capturedChoose.one': 'Capturou {n} semente! Agora escolha uma casa extra.',
  'game.capturedChoose.other': 'Capturou {n} sementes! Agora escolha uma casa extra.',
  'game.capturedBy.one': '{name} capturou {n} semente{extra}.',
  'game.capturedBy.other': '{name} capturou {n} sementes{extra}.',
  'game.includingExtra': ', incluindo a casa extra {bin}',
  'game.loopLimit': 'Limite de segurança das continuações atingido — a vez termina.',
  'game.aiNoMove': 'O computador não encontrou nenhuma jogada.',
  'game.hintThinking': 'A pensar numa boa jogada…',
  'game.hintResult': 'Sugestão: jogue <b>{bin}</b> (anel azul-claro).',
  'game.nothingToUndo': 'Nada para desfazer.',
  'game.overInfo': 'Fim do jogo — use o botão ❚❚ para recomeçar ou voltar ao menu.',

  'move.game-over': 'O jogo terminou.',
  'move.awaiting-extra': 'Primeiro escolha uma casa extra do adversário para capturar.',
  'move.not-a-bin': 'Essa não é uma das suas casas.',
  'move.empty': 'Essa casa está vazia.',
  'move.phase-one-single': 'Enquanto tiver uma casa com mais de uma semente, não pode jogar uma semente sozinha.',
  'move.next-not-empty': 'Na segunda fase, uma semente sozinha só pode ser jogada para uma casa seguinte vazia.',

  'preview.sows.one': '<b>{bin}</b>: semeia {n} semente',
  'preview.sows.other': '<b>{bin}</b>: semeia {n} sementes',
  'preview.ends': ', termina em {bin} (anel azul)',
  'preview.captures': ' — <b>captura {n}</b>',
  'preview.plusExtra': ' + uma casa extra',
  'preview.wins': ' — <b>ganha o jogo!</b>',

  'history.sown': '{who} {label}: {n} semeadas',
  'history.relays.one': ', {n} continuação',
  'history.relays.other': ', {n} continuações',
  'history.ends': ', termina em {bin}',
  'history.captures': ' — captura {n}',
  'history.extra': ' (extra {bin})',
  'history.loopLimit': ' (limite de continuações)',

  'tutorial.step': 'Passo {n} de {total}',
  'tutorial.retry': 'Repetir',
  'tutorial.next': 'Seguinte',
  'tutorial.finish': 'Terminar',
  'tutorial.exit': 'Sair do tutorial',
  'tutorial.wellDone': 'Muito bem!',
  'tutorial.stepComplete': 'Passo concluído — carregue em <b>Seguinte</b> para continuar ou em <b>Repetir</b> para tentar de novo.',
  'tutorial.playHighlighted': 'Neste passo, jogue a casa destacada.',
  'tutorial.complete': 'Tutorial concluído. Bom jogo!',
};

export const DICTIONARIES = { en, pt };

function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTIONARIES[saved]) return saved;
  } catch {
    // ignore
  }
  const nav = (globalThis.navigator?.language ?? 'pt').slice(0, 2).toLowerCase();
  return DICTIONARIES[nav] ? nav : 'pt';
}

let current = typeof window === 'undefined' ? 'en' : detect();
const listeners = new Set();

export function getLanguage() {
  return current;
}

export function t(key, params) {
  let s = DICTIONARIES[current][key] ?? DICTIONARIES.en[key] ?? key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}

export function setLanguage(lang) {
  if (!DICTIONARIES[lang] || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
  applyTranslations();
  listeners.forEach((fn) => fn(lang));
}

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyTranslations(root = globalThis.document) {
  if (!root) return;
  if (root.documentElement) root.documentElement.lang = current;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
