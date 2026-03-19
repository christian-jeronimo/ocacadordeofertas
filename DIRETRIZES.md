# Diretrizes e Objetivos: Caçador de Ofertas

Este documento serve como a **fonte da verdade e bússola** para o desenvolvimento, manutenção e expansão do site "Caçador de Ofertas". Todos os desenvolvedores, agentes e envolvidos devem consultar e seguir estas diretrizes ao criar novas features ou refinar o design.

## 🎯 Objetivo Principal

**O site tem um ÚNICO foco: Cupons, Descontos e Ofertas Genéricas.**
Não somos um e-commerce ou um comparador de preços de produtos físicos individuais. Nosso foco é atrair usuários que buscam economizar de forma rápida e eficiente antes de fechar o carrinho em lojas parceiras.

## 🚫 O que o site NÃO É

*   **NÃO é um catálogo de produtos:** Não focamos em exibir um produto específico (ex: "iPhone 15 Pro Max 256GB").
*   **NÃO há carrinho de compras:** O checkout SEMPRE acontece na loja do parceiro.
*   **NÃO possui avaliações complexas de produtos:** O foco é avaliar *a promoção* ou o *cupom*, não o produto em si.

## ✅ O que o site DEVE SER

*   **Rápido e Direto:** O usuário deve encontrar o cupom ou promoção em no máximo 3 cliques.
*   **Visualmente Atrativo, mas Limpo:** Design premium que inspire confiança, sem poluição visual que atrapalhe a conversão.
*   **Focado em Ação (CTA forte):** Botões como "Pegar Cupom" ou "Pegar Oferta" devem ser os elementos mais proeminentes na tela.
*   **Confiável:** A diferenciação clara entre cupons ativos ✅ e expirados ❌ é sagrada para manter a confiança do usuário.

## 📐 Diretrizes de Design e UX

1.  **Foco no Código/Desconto:** O valor do desconto (ex: "15% OFF", "R$ 50 de Desconto") é a informação mais importante do card.
2.  **Identidade das Lojas Parceiras:** O logotipo da loja parceira (Amazon, Mercado Livre, Shopee) deve estar claro para que o usuário identifique rapidamente de onde é a oferta.
3.  **Surpresa e Escassez (Sensação de "Caça"):** Elementos visuais que reforcem que as ofertas são por tempo limitado ou exclusivas (ex: Cupons "spoiler", banners de "Ofertas Relâmpago").
4.  **Mobile-First Absoluto:** A esmagadora maioria dos usuários buscará cupons pelo celular enquanto faz compras ou navega em redes sociais. A interface mobile deve ser impecável, com botões fáceis de clicar (grandes o suficiente para o dedo - Touch Targets).

## 🛠️ Diretrizes Técnicas

1.  **Geração Estática:** O site opera com arquivos HTML estáticos gerados a partir de um JSON central (`cupons.json`). Esta arquitetura NÃO DEVE ser alterada para sistemas pesados (bancos de dados no frontend dependentes de servidor), garantindo o tempo de carregamento < 1 segundo.
2.  **Ferramental Moderno, mas Sem Frameworks Pesados:** O front-end usa Vanilla HTML/CSS/JS otimizado. Adicionar bibliotecas pesadas de JavaScript ou CSS frameworks inteiros para funções simples (*overengineering*) é proibido.
3.  **SEO Otimizado para Cupons:** Uso obrigatório de Schema.org focado em `Offer` e `DiscountOffer` para garantir que o Google entenda que não vendemos produtos, mas indicamos promoções.
4.  **Métricas Leves:** O rastreamento de conversão (ex: cliques em cupons, redirecionamentos) deve continuar usando sistemas eficientes e assíncronos que não travem a renderização da página.

## 📈 Metas de Conversão

Cada alteração no site deve ser pensada com as seguintes métricas em mente:
*   **Copiar Cupom ou Clicar na Oferta:** É a métrica de sucesso primária.
*   **Entrar no Grupo VIP (WhatsApp/Telegram):** É a métrica de sucesso secundária (Retenção).
*   **Tempo de permanência baixo é bom!** O usuário entra, pega o cupom e vai comprar na loja parceira. Não precisamos "prender" o usuário no site lendo blocos gigantes de texto.

---
*Este documento é vivo e deve ser atualizado sempre que houver uma pivotagem estratégica no modelo de negócios do Caçador de Ofertas.*
