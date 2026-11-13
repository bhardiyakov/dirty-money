# Interiores em 3D

Implementação: `src/art/Interior3D.js`. Integração: `src/world/Interiors.js` (`_room`, `_doEnter`, `update`) e `src/game.js`
(`_updateInterior`: câmera de 3ª pessoa nas salas 3D). `Config.art.interior3d = false` ou `?interior=2d` volta às salas pintadas vistas de cima.

## De onde vem a sala

Os layouts não mudaram: os `ShopStyles` (lojas), `HomeStyles` (casas), `BankStyles` e `JewelryStyles` decidem onde fica cada móvel, os
sólidos, os pontos de uso e a clientela. Enquanto o layout pinta, o `ShopCtx` grava cada peça com os parâmetros dela
(`art/InteriorHD.js`) e, agora, também os sólidos que ela registrou (`op.o0..o1`) e a base de verdade de cada sólido (`bz1`, sem a folga
da vista oblíqua). Com a gravação, a sala é montada em volume, como uma casa de bonecas sem teto.

| Parte | Como fica |
| --- | --- |
| Piso | A pintura HD só do piso, tapetes, sombras de contato e da luz da sala (sem os móveis). |
| Parede do fundo | A face pintada dela: quadros, janelas, cardápio, prateleiras de parede, TV, relógio, neon. |
| Laterais e frente | A textura de parede do tipo (tinta, tijolo, madeira, azulejo, lambri, bambu…), repetida. Rodapé, tampo das paredes (o corte), batentes da porta e a rua lá fora (clara de dia, escura de noite). |
| Móveis com modelo próprio | Mesa (tampo com a toalha e os pratos pintados, pés ou coluna), cadeira, banqueta, vaso de planta, luminária pendente, lanterna japonesa, prateleira de parede e gôndola (produtos em volume nas cores da loja), geladeira de bebidas (garrafas acesas), máquina de venda, academia (suporte de barra com anilhas, banco de supino, esteira, tapetes), manequim. |
| Todo o resto | Balcão, forno, mesa de sinuca, jukebox, cama, sofá, piano, cofre, vitrine, caixa eletrônico…: um bloco do tamanho do sólido da peça com o **topo** e a **frente** recortados da pintura HD dela. |
| Esconderijo | Os mesmos sólidos e a pintura HD do barraco (`Interior3D.buildHome`), com o contrapiso de cimento repintado sem os móveis e paredes de tijolo. |

## Vida

- Luminárias onde a sala tem luz: calha fluorescente no mercado, farmácia, academia e loja de armas; pendente nos outros (dourada nos
  restaurantes finos e casas de luxo). As 4 luzes mais fortes viram luzes pontuais que só iluminam a sala.
- Janelas da parede do fundo acesas, com o feixe de luz até o piso.
- Ventilador de teto girando nos bares, lanchonetes, restaurantes, na boca e nas casas.
- Vapor da cozinha, do forno a lenha, do balcão de sushi e da chapa; poeira flutuando na luz.
- A TV da parede muda de cena (o brilho varia); o neon pulsa e às vezes falha.

## Câmera e paredes

Nas salas 3D a câmera é a de 3ª pessoa (`FootCamera`), como na rua, mais perto (`Interiors.zoom`). As paredes que ficam entre a câmera e o
jogador ficam quase transparentes. Os sólidos do jogador são as bases de verdade dos móveis. No modo de decorar a casa (`HomeDecor`) a câmera
volta a ser a de cima, e os móveis colocados apoiam no piso da sala 3D (`HomeDecor.FLOOR_Y`).

## Correção

Ao entrar numa loja, o `Interiors._unloadCity` desligava toda malha marcada como "sempre desenhar" — inclusive as do boneco 3D
(`art/Char3D.js`): o jogador e os NPCs 3D sumiam dentro das lojas. As malhas do boneco agora são marcadas (`_char3d`) e ficam de fora.

O estádio (`Maracana.room`) segue com a sala pintada.
