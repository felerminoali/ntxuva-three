/**
 * Guided tutorial. Each step can load a small 4 x 8 position and ask the learner to make a move.
 * Bin numbers are South's indices (see gameLogic.js); `task.bins` limits which bins may be played.
 * `title`, `body` and `done` are English; a per-language object (e.g. `pt`) overrides them.
 */
export const TUTORIAL_COLUMNS = 8;

/** Returns the step with its texts in `lang` (falls back to English). */
export function localizeStep(step, lang) {
  const text = step[lang];
  return text ? { ...step, ...text } : step;
}

export const TUTORIAL_STEPS = [
  {
    title: 'Welcome to Ntuxa',
    pt: {
      title: 'Bem-vindo ao Ntuxa',
      body: `<p>O <b>Ntuxa</b> (também escrito <i>Ntxuva</i>; chamado <i>Mthadje</i> ou <i>M'pale</i> no norte de
        Moçambique) é um jogo de mancala de quatro filas. Dois jogadores movem sementes ou pequenas pedras pelas
        casas esculpidas num tabuleiro de madeira.</p>
        <p><b>Objetivo:</b> capturar <b>todas</b> as sementes do adversário.</p>
        <p>Esta lição usa um tabuleiro pequeno de 4 × 8. Joga com o <b>Sul</b>, o lado mais perto de si.</p>`,
    },
    body: `<p><b>Ntuxa</b> (also written <i>Ntxuva</i>; called <i>Mthadje</i> or <i>M'pale</i> in northern
      Mozambique) is a four-row mancala game. Two players move seeds or small stones around carved
      bins on a wooden board.</p>
      <p><b>Goal:</b> capture <b>all</b> of your opponent's seeds.</p>
      <p>This lesson uses a small 4 × 8 board. You play <b>South</b>, the side nearest you.</p>`,
    setup: 'initial',
  },
  {
    title: 'Your side of the board',
    pt: {
      title: 'O seu lado do tabuleiro',
      body: `<p>É dono das duas filas mais perto de si (destacadas). O adversário é dono das duas filas do fundo.</p>
        <ul><li>A fila no meio do tabuleiro é a sua <b>fila de ataque</b> (fila da frente, "b").</li>
        <li>A fila na borda é a sua <b>fila de trás</b> ("a").</li></ul>
        <p>As sementes andam sempre no <b>sentido contrário ao dos ponteiros do relógio</b> à volta das suas duas filas:
        da esquerda para a direita na fila de trás e depois da direita para a esquerda na fila da frente.</p>`,
    },
    body: `<p>You own the two rows nearest you (highlighted). Your opponent owns the far two rows.</p>
      <ul><li>The row in the middle of the board is your <b>attacking row</b> (front row, "b").</li>
      <li>The row on the edge is your <b>back row</b> ("a").</li></ul>
      <p>Seeds only ever travel <b>anti-clockwise</b> around your own two rows: left to right along
      the back row, then right to left along the front row.</p>`,
    setup: 'initial',
    showOwnSide: true,
  },
  {
    title: 'Sowing',
    pt: {
      title: 'Semear',
      body: `<p>Na sua vez, escolha uma das suas casas, apanhe <b>todas</b> as sementes e deixe-as cair uma a uma
        nas casas seguintes, no sentido contrário ao dos ponteiros do relógio.</p>
        <p><b>Experimente:</b> jogue a casa destacada com 3 sementes.</p>`,
      done: 'A última semente caiu numa casa <b>vazia</b>, por isso a sua vez terminou.',
    },
    body: `<p>On your turn, choose one of your bins, pick up <b>all</b> its seeds and drop them one by one
      into the next bins, anti-clockwise.</p>
      <p><b>Try it:</b> play the highlighted bin with 3 seeds.</p>`,
    setup: { south: { 2: 3, 10: 2 }, north: { 0: 2, 4: 2 } },
    task: { bins: [2] },
    done: 'The last seed fell into an <b>empty</b> bin, so your turn ended.',
  },
  {
    title: 'Relay sowing',
    pt: {
      title: 'Continuar a semear',
      body: `<p>Se a última semente cair numa casa que <b>já tinha sementes</b>, apanhe tudo o que está nessa
        casa e continue a semear a partir dali. Isto pode acontecer muitas vezes na mesma jogada.</p>
        <p><b>Experimente:</b> jogue a casa destacada e veja as sementes a continuar a andar.</p>`,
      done: 'A última semente caiu sobre duas sementes, por isso apanhou três e continuou até uma semente cair numa casa vazia.',
    },
    body: `<p>If your last seed lands in a bin that <b>already had seeds</b>, pick up everything in that
      bin and keep sowing from there. This can happen many times in one turn.</p>
      <p><b>Try it:</b> play the highlighted bin and watch the seeds keep moving.</p>`,
    setup: { south: { 1: 2, 3: 2, 12: 2 }, north: { 0: 2, 7: 2 } },
    task: { bins: [1] },
    done: 'Your last seed landed on two seeds, so you picked up three and carried on until a seed fell into an empty bin.',
  },
  {
    title: 'Capturing',
    pt: {
      title: 'Capturar',
      body: `<p>Se a sua vez terminar numa <b>casa vazia da sua fila de ataque</b> e a casa de ataque do adversário
        <b>mesmo em frente</b> tiver sementes, captura <b>as duas</b> casas dele nessa coluna. Se essa casa da frente
        estiver vazia, não captura nada.</p>
        <p>Com a <b>regra opcional da casa extra</b> (escolhida antes do início do jogo) leva também <b>uma casa extra
        à sua escolha</b> de qualquer ponto do lado dele. Este passo usa essa opção.</p>
        <p><b>Experimente:</b> jogue a casa destacada e depois clique numa casa com anel vermelho para a levar como extra.</p>`,
      done: 'As sementes capturadas saem do jogo; vão para a sua cabaça.',
    },
    body: `<p>If your turn ends in an <b>empty bin in your attacking row</b>, and the opponent's attacking bin
      <b>directly facing it</b> has seeds, you capture <b>both</b> of their bins in that column. If that facing
      bin is empty, nothing is captured.</p>
      <p>With the optional <b>extra bin rule</b> (chosen before the game starts) you also take <b>one extra bin of
      your choice</b> from anywhere on their side. This step uses that option.</p>
      <p><b>Try it:</b> play the highlighted bin, then click a red-ringed bin to take as your extra.</p>`,
    setup: { south: { 6: 3, 7: 1, 13: 2 }, north: { 14: 3, 1: 2, 5: 4, 10: 1 } },
    extraCapture: true,
    task: { bins: [6] },
    done: 'Captured seeds leave the game; they go into your calabash.',
  },
  {
    title: 'The second phase',
    pt: {
      title: 'A segunda fase',
      body: `<p>Enquanto alguma das suas casas tiver <b>duas ou mais</b> sementes, tem de jogar uma dessas casas.</p>
        <p>Quando <b>todas</b> as casas não vazias do seu lado tiverem exatamente uma semente, começa a segunda fase:
        pode mover uma semente sozinha, mas só para uma casa seguinte <b>vazia</b>.</p>
        <p><b>Experimente:</b> só três das suas cinco casas podem ser jogadas. Escolha uma. Consegue encontrar a captura?</p>`,
      done: 'Nesta fase cada jogada move uma só semente um passo, por isso planeie bem as suas capturas.',
    },
    body: `<p>While any of your bins holds <b>two or more</b> seeds, you must play one of those bins.</p>
      <p>Once <b>every</b> non-empty bin on your side has exactly one seed, the second phase begins:
      you may move a single seed, but only into an <b>empty</b> next bin.</p>
      <p><b>Try it:</b> only three of your five bins are playable. Pick one. Can you find the capture?</p>`,
    setup: { south: { 0: 1, 1: 1, 3: 1, 8: 1, 9: 1 }, north: { 13: 2, 7: 1, 2: 1 } },
    task: { bins: 'any' },
    done: 'In this phase each turn moves a single seed one step, so plan your captures carefully.',
  },
  {
    title: 'Winning the game',
    pt: {
      title: 'Ganhar o jogo',
      body: `<p>O jogo termina quando um jogador captura todas as sementes do adversário.</p>
        <p><b>Experimente:</b> o Norte só tem três sementes. Capture-as todas.</p>`,
      done: 'O Norte ficou sem sementes, por isso ganhou!',
    },
    body: `<p>The game ends when one player has captured all of the opponent's seeds.</p>
      <p><b>Try it:</b> North has only three seeds left. Take them all.</p>`,
    setup: { south: { 12: 2, 0: 3 }, north: { 9: 2, 6: 1 } },
    task: { bins: [12] },
    done: 'North has no seeds left, so you win!',
  },
  {
    title: 'Strategy tips',
    pt: {
      title: 'Dicas de estratégia',
      body: `<ul>
        <li><b>Conte antes de semear.</b> As continuações criam cadeias longas; a antevisão no modo Prática mostra onde termina uma jogada.</li>
        <li><b>Proteja as suas colunas.</b> As sementes em frente a uma casa de ataque vazia do adversário estão em perigo.</li>
        <li><b>Escolha bem a casa extra</b> (só com a regra da casa extra). Leve a casa que tira ao adversário o seu melhor ataque, não apenas o maior monte.</li>
        <li><b>Prepare a segunda fase.</b> Com sementes sozinhas, são as casas vazias que decidem quem ainda pode jogar.</li>
        </ul>
        <p>Está pronto! Experimente a <b>Prática</b> para explorar jogadas, ou jogue contra o computador.</p>`,
    },
    body: `<ul>
      <li><b>Count before you sow.</b> Relays make long chains; the preview in Practice mode shows where a move ends.</li>
      <li><b>Protect your columns.</b> Seeds facing an opponent's empty attacking bin are at risk.</li>
      <li><b>Choose the extra bin wisely</b> (extra bin rule only). Take the bin that removes your opponent's best attack, not just the biggest pile.</li>
      <li><b>Prepare the second phase.</b> With single seeds, empty bins decide who can still move.</li>
      </ul>
      <p>You're ready! Try <b>Practice</b> to explore moves, or play the computer.</p>`,
  },
];
