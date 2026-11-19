# Jogo instalado (PC e celular) × versão de teste

## Versão de TESTE (HTML direto do disco)
- Rode o servidor local (`serve.ps1`, ou qualquer servidor estático na pasta do projeto) e abra `http://localhost:.../index.html`.
- Em **localhost** (ou com `?dev` no endereço) o jogo **não usa cache nenhum**: tudo vem do disco, a edição aparece no próximo
  recarregar. Se um service worker antigo tiver ficado registrado, ele é removido.
- Os testes automáticos (`npm test`) rodam assim.

## Versão PUBLICADA / INSTALADA
- `node scripts/package-legacy.mjs` (o Vercel roda no deploy; o Tauri antes do build) monta `dist-game/` com o `sw.js` e a lista de
  todos os arquivos com a impressão digital de cada um.
- **1ª visita**: o jogo baixa o pacote principal (~31 MB: código, bibliotecas, carros, texturas) e guarda no aparelho — aparece
  "Guardando o jogo no aparelho… %". Os personagens (~400 MB) e os carros HD ficam guardados à medida que aparecem no jogo.
- **Daí em diante**: abre direto do aparelho, também **sem internet**.
- **Versão nova** (novo deploy): baixa em segundo plano **só os arquivos que mudaram**, tudo ou nada (nunca metade nova e metade velha).
  Pronta, aparece o aviso "Nova versão do jogo baixada": ela entra ao reabrir o jogo, ou na hora em "Atualizar agora".
- Para testar esse modo no seu PC: rode o pacote e sirva `dist-game/` em localhost abrindo com `?sw=1`.

## Instalar
- **PC**: no Chrome/Edge, o ícone "Instalar app" na barra de endereço (vira um app com janela própria) — ou o instalador do Tauri
  (`npm run build`: o `.exe` já traz tudo dentro, sem cache).
- **Android**: Chrome → menu → "Instalar app" / "Adicionar à tela inicial" (tela cheia, deitado).
- **iPhone/iPad**: Safari → Compartilhar → "Adicionar à Tela de Início" (o iOS limita o espaço guardado; o pacote principal cabe).
