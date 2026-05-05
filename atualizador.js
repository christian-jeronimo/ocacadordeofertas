const fs = require('fs');

// COLE O LINK DA SUA PLANILHA AQUI (Tem que ser o link gerado no "Publicar na Web")
const urlPlanilha = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2REpLC9EdFoSD2Fs5kl7MjOeEhYzSjoi7152nupjhb-rGMC8zkkkd3qB8c3ZroDljaklkkA35pXbZ/pub?output=tsv';

// DOMÍNIO REAL DO SITE (usado no sitemap, canonical URLs e robots.txt)
const baseUrl = 'https://cacadordeofertas.com.br';

function criarSlug(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function atualizarViaPlanilha() {
    console.log("Conectando ao Google Sheets...");

    try {
        const resposta = await fetch(urlPlanilha);
        const textoTSV = await resposta.text();

        // Separa o texto em linhas
        const linhas = textoTSV.split('\n');

        // Pega a primeira linha para ser as chaves do nosso JSON (loja, titulo, etc)
        const cabecalhos = linhas[0].split('\t').map(h => h.trim());
        const ofertas = [];

        // Começa a ler a partir da segunda linha (i = 1)
        for (let i = 1; i < linhas.length; i++) {
            if (!linhas[i].trim()) continue; // Pula linhas vazias

            const valores = linhas[i].split('\t');
            const produto = {};

            cabecalhos.forEach((cabecalho, index) => {
                let valor = valores[index] ? valores[index].trim() : '';

                // Se a coluna for "ativo", converte o texto para booleano (verdadeiro/falso)
                if (cabecalho === 'ativo') {
                    produto[cabecalho] = (valor.toLowerCase() === 'true' || valor.toLowerCase() === 'verdadeiro' || valor.toLowerCase() === 'sim' || valor === '1');
                } else {
                    produto[cabecalho] = valor;
                }
            });

            ofertas.push(produto);
        }

        // Salva os produtos no nosso banco de dados JSON
        fs.writeFileSync('cupons.json', JSON.stringify(ofertas, null, 2));
        console.log(`✅ Sucesso! JSON gerado: ${ofertas.length} ofertas salvas.`);

        // --- INÍCIO DA GERAÇÃO ESTÁTICA (SSG) ---
        console.log("Iniciando geração das páginas estáticas (SSG)...");

        const templateHtml = fs.readFileSync('template.html', 'utf8');

        // Agrupar e contar ofertas ativas por loja
        const contagemLojas = {};
        const lojasSlugs = {};

        ofertas.forEach(oferta => {
            const loja = oferta.loja.trim();
            if (!loja) return;

            if (!contagemLojas[loja]) {
                contagemLojas[loja] = 0;
                lojasSlugs[loja] = 'cupom-' + criarSlug(loja);
            }
            if (oferta.ativo) {
                contagemLojas[loja]++;
            }
        });

        // Função auxiliar para gerar o menu de lojas
        function gerarMenuLojas(lojaAtualSlug = null) {
            let htmlMenu = `<a href="index.html" class="store-chip ${lojaAtualSlug === null ? 'active' : ''}">Todas as Ofertas</a>`;

            // Ordenar lojas pelo nome
            const lojasOrdenadas = Object.keys(contagemLojas).sort((a, b) => a.localeCompare(b));

            lojasOrdenadas.forEach(lojaNome => {
                const count = contagemLojas[lojaNome];
                if (count === 0) return; // Não exibe no menu se não tem oferta ativa nesta avaliação

                const slug = lojasSlugs[lojaNome];
                const activeClass = lojaAtualSlug === slug ? 'active' : '';

                htmlMenu += `<a href="${slug}.html" class="store-chip ${activeClass}">${lojaNome} <span class="store-badge">${count}</span></a>`;
            });
            return htmlMenu;
        }

        // Função auxiliar para gerar os cards de cupom e o JSON-LD de schema.org
        function gerarCardsESchema(listaOfertas, nomeLoja) {
            let htmlAtivos = '';
            let htmlExpirados = '';
            let schemaOfertas = [];
            let inativeMessage = ""; // Se não tiver a gente adiciona

            listaOfertas.forEach(cupom => {
                const temCodigo = cupom.codigo && cupom.codigo.trim() !== '';

                // Codificar para garantir
                const linkSafe = cupom.link.replace(/'/g, "\\'");
                const codigoSafe = temCodigo ? cupom.codigo.replace(/'/g, "\\'") : "";
                
                const lojaSafe = cupom.loja.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const tituloSafe = cupom.titulo.replace(/'/g, "\\'").replace(/"/g, '&quot;');

                const acaoBotao = temCodigo ? `revelarCupom('${linkSafe}', '${codigoSafe}', '${lojaSafe}', '${tituloSafe}')` : `abrirPromocao('${linkSafe}', '${lojaSafe}', '${tituloSafe}')`;
                const labelAcessibilidade = temCodigo ? `Pegar cupom para ${cupom.titulo}` : `Pegar promoção de ${cupom.titulo}`;

                let htmlBotaoAtivo = '';
                if (temCodigo) {
                    const cod = cupom.codigo.trim();
                    if (cod.length >= 3) {
                        const spoiler = cod.slice(-3);
                        htmlBotaoAtivo = `
                             <button class="btn-spoiler" onclick="${acaoBotao}" aria-label="${labelAcessibilidade}">
                                 <span class="spoiler-left">PEGAR CUPOM<span class="spoiler-fold"></span></span>
                                 <span class="spoiler-right">${spoiler}</span>
                             </button>
                         `;
                    } else if (cod.length > 0) {
                        const spoiler = cod.slice(-1);
                        htmlBotaoAtivo = `
                             <button class="btn-spoiler" onclick="${acaoBotao}" aria-label="${labelAcessibilidade}">
                                 <span class="spoiler-left">PEGAR CUPOM<span class="spoiler-fold"></span></span>
                                 <span class="spoiler-right">${spoiler}</span>
                             </button>
                         `;
                    } else {
                        htmlBotaoAtivo = `<button class="btn-get" onclick="${acaoBotao}" aria-label="${labelAcessibilidade}">PEGAR CUPOM</button>`;
                    }
                } else {
                    htmlBotaoAtivo = `<button class="btn-get" onclick="${acaoBotao}" aria-label="${labelAcessibilidade}">PEGAR PROMOÇÃO</button>`;
                }

                if (cupom.ativo) {
                    const dataHojeCurta = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                    htmlAtivos += `
                        <article class="coupon-card">
                            <div class="store-logo">${cupom.loja}</div>
                            <div class="coupon-info">
                                <h3>${cupom.titulo}</h3>
                                <p>${cupom.descricao}</p>
                                <p class="coupon-date">⏳ Validado em: ${dataHojeCurta}</p>
                            </div>
                            ${htmlBotaoAtivo}
                        </article>
                    `;

                    schemaOfertas.push({
                        "@type": "Offer",
                        "name": cupom.titulo + " em " + cupom.loja,
                        "description": cupom.descricao,
                        "url": cupom.link,
                        "availability": "https://schema.org/InStock"
                    });

                } else {
                    htmlExpirados += `
                        <article class="coupon-card expired">
                            <div class="expired-badge">EXPIRADO</div>
                            <div class="store-logo">${cupom.loja}</div>
                            <div class="coupon-info">
                                <h3>${cupom.titulo}</h3>
                                <p>${cupom.descricao}</p>
                            </div>
                            <button class="btn-get" disabled aria-label="Oferta expirada para ${cupom.titulo}">ESGOTADO</button>
                        </article>
                    `;
                }
            });

            if (htmlAtivos === '') { htmlAtivos = `<p style="text-align:center; padding: 20px; color: #666;">Nenhuma oferta ativa no momento para esta categoria.</p>` }
            if (htmlExpirados === '') { htmlExpirados = `<p style="text-align:center; padding: 20px; color: #666;">Nenhuma oferta expirada registrada nesta categoria.</p>` }

            let schemaLd = '';
            if (schemaOfertas.length > 0) {
                schemaLd = `
                <script type="application/ld+json">
                {
                    "@context": "https://schema.org",
                    "@type": "ItemList",
                    "itemListElement": ${JSON.stringify(schemaOfertas)}
                }
                </script>`;
            }

            return { htmlAtivos, htmlExpirados, schemaLd };
        }

        // --- FUNÇÕES SEO ---

        // Gerar keywords dinâmicas por loja
        function gerarKeywords(nomeLoja = null) {
            const keywordsBase = ['cupom de desconto', 'ofertas', 'promoção', 'descontos', 'economizar', 'caçador de cupom', 'melhores sites de cupons'];
            if (nomeLoja) {
                const lojaLower = nomeLoja.toLowerCase();
                let extraKeywords = [];
                if (lojaLower === 'mercado livre') {
                    extraKeywords = ['cupom ml', 'cupom ml hoje', 'cupom meli', 'cupom de desconto ml hoje', 'código meli'];
                }
                return [
                    `cupom ${lojaLower}`,
                    `desconto ${lojaLower}`,
                    `promoção ${lojaLower}`,
                    `ofertas ${lojaLower}`,
                    `cupom de desconto ${lojaLower}`,
                    `código promocional ${lojaLower}`,
                    ...extraKeywords,
                    ...keywordsBase
                ].join(', ');
            }
            // Home: keywords genéricas com nomes das lojas
            const lojasNomes = Object.keys(contagemLojas).map(l => l.toLowerCase());
            return [
                ...keywordsBase,
                ...lojasNomes.map(l => `cupom ${l}`),
                ...lojasNomes.map(l => `ofertas ${l}`),
                'achadinhos', 'cupom suplementos'
            ].join(', ');
        }



        // Gerar Schema.org BreadcrumbList
        function gerarBreadcrumbSchema(nomeArquivo, nomeLoja = null) {
            const items = [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Início",
                    "item": `${baseUrl}/`
                }
            ];
            if (nomeLoja) {
                items.push({
                    "@type": "ListItem",
                    "position": 2,
                    "name": `Cupons ${nomeLoja}`,
                    "item": `${baseUrl}/${nomeArquivo}`
                });
            }
            return `
                <script type="application/ld+json">
                {
                    "@context": "https://schema.org",
                    "@type": "BreadcrumbList",
                    "itemListElement": ${JSON.stringify(items)}
                }
                </script>`;
        }

        // Função para instanciar as marcações e criar de fato o HTML da página
        function construirPagina(listaOfertas, title, metadescription, slug, nomeLoja = null) {
            const { htmlAtivos, htmlExpirados, schemaLd } = gerarCardsESchema(listaOfertas, title);

            const nomeArquivo = slug ? `${slug}.html` : 'index.html';
            const canonicalUrl = nomeArquivo === 'index.html' ? `${baseUrl}/` : `${baseUrl}/${nomeArquivo}`;
            const keywords = gerarKeywords(nomeLoja);
            
            const menuHtml = gerarMenuLojas(slug);
            const breadcrumbSchema = gerarBreadcrumbSchema(nomeArquivo, nomeLoja);
            const anoAtual = new Date().toLocaleString('pt-BR', { year: 'numeric', timeZone: 'America/Sao_Paulo' });
            
            const formatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
            const dataHoje = formatter.format(new Date());

            let seoText = '';
            if (nomeLoja) {
                if (nomeLoja.toLowerCase() === 'mercado livre') {
                    seoText = `
                    <article class="seo-text-area">
                        <h2>Cupom Mercado Livre Válido Hoje (ML)</h2>
                        <p>Buscando um <strong>cupom de desconto no ML para usar hoje</strong>? O <strong>Caçador de Ofertas</strong> ajuda você a economizar em todas as suas compras no Mercado Livre. Nossa equipe avalia e testa diariamente os códigos promocionais e links de desconto mais relevantes para garantir que você sempre pague menos.</p>
                        
                        <h3>Como usar o Cupom ML Hoje?</h3>
                        <p>Para usar um cupom de desconto no Mercado Livre, basta clicar no botão "PEGAR CUPOM", copiar o código revelado e colá-lo no aplicativo ou site oficial. Caso o botão indique "PEGAR PROMOÇÃO", o desconto já estará aplicado no preço do produto através do nosso link especial de ofertas.</p>
                        
                        <h3>Códigos de Desconto Meli são confiáveis?</h3>
                        <p>Sim, todos os <strong>cupons Meli</strong> que destacamos aqui pertencem a promoções oficiais do Mercado Livre, onde milhares de usuários compram todos os dias com total segurança. Atualizamos a lista diariamente para que você sempre encontre um código ativo.</p>
                    </article>`;
                } else if (nomeLoja.toLowerCase() === 'amazon') {
                    seoText = `
                    <article class="seo-text-area">
                        <h2>Cupom de Desconto Amazon e Ofertas Prime</h2>
                        <p>No <strong>Caçador de Ofertas</strong>, você encontra o <strong>cupom Amazon</strong> perfeito para a sua compra. Testamos códigos promocionais diariamente, seja para <strong>frete grátis</strong>, <strong>primeira compra</strong> ou descontos em categorias como Kindle, Eletrônicos e Casa.</p>
                        
                        <h3>Como usar o cupom de desconto Amazon?</h3>
                        <p>Clique em "PEGAR CUPOM" para revelar o código e copie-o. Na tela de pagamento do site ou aplicativo da Amazon, cole o código no campo "Adicionar vale-presente ou código promocional" e clique em aplicar. Se o botão for "PEGAR PROMOÇÃO", a oferta já estará embutida no link!</p>
                        
                        <h3>Dica do Caçador de Cupom para a Amazon</h3>
                        <p>Muitas vezes, os maiores descontos da Amazon não exigem código, eles são aplicados diretamente no link da oferta relâmpago ou na assinatura do <strong>Amazon Prime</strong>. Fique de olho nas tags de "Oferta do Dia" na nossa lista.</p>
                    </article>`;
                } else {
                    seoText = `
                    <article class="seo-text-area">
                        <h2>Cupom de Desconto ${nomeLoja} e Ofertas</h2>
                        <p>O <strong>Caçador de Ofertas</strong> ajuda você a economizar em todas as suas compras na <strong>${nomeLoja}</strong>. Nossa equipe avalia e testa diariamente os códigos promocionais e links de desconto mais relevantes para garantir que você sempre pague menos.</p>
                        
                        <h3>Como usar o cupom ${nomeLoja}?</h3>
                        <p>Para usar um cupom de desconto na ${nomeLoja}, basta clicar no botão "PEGAR CUPOM", copiar o código revelado e colá-lo no campo correspondente no carrinho de compras do site oficial. Caso o botão indique "PEGAR PROMOÇÃO", o desconto já estará aplicado magicamente no preço do produto através do nosso link especial de afiliado.</p>
                        
                        <h3>A loja ${nomeLoja} é confiável?</h3>
                        <p>Sim, todos os cupons que destacamos aqui pertencem a lojas de confiança onde milhares de usuários compram todos os dias com total segurança e respeito à privacidade dos dados. Nossa curadoria filtra qualquer lojista que não atenda a padrões rigorosos de qualidade.</p>
                    </article>`;
                }
            } else {
                seoText = `
                <article class="seo-text-area">
                    <h2>Caçador de Ofertas: Um dos Melhores Sites de Cupons de Desconto do Brasil</h2>
                    <p>Seja bem-vindo ao <strong>Caçador de Ofertas</strong> (também conhecido por muitos como seu <strong>caçador de cupom</strong> favorito!), o seu local definitivo para economizar de verdade nas maiores lojas de e-commerce da internet. Nós verificamos nossos códigos todos os dias incansavelmente.</p>
                    <h3>Como economizar com o Caçador de Ofertas</h3>
                    <p>Basta navegar no nosso sumário de lojas parceiras, encontrar a oferta ou cupom ideal que você procura e aproveitar. Sem letras miúdas ou complicações. O abatimento rola fácil e vai direto pro seu bolso!</p>
                </article>`;
            }

            let htmlFinal = templateHtml
                .replace(/{{TITLE}}/g, title)
                .replace(/{{META_DESCRIPTION}}/g, metadescription)
                .replace(/{{META_KEYWORDS}}/g, keywords)
                .replace(/{{CANONICAL_URL}}/g, canonicalUrl)
                .replace(/{{CONTEUDO_ATIVOS}}/g, htmlAtivos)
                .replace(/{{CONTEUDO_EXPIRADOS}}/g, htmlExpirados)
                .replace(/{{SCHEMA_ORG}}/g, schemaLd)
                .replace(/{{MENU_LOJAS}}/g, menuHtml)
                .replace(/{{BREADCRUMB_SCHEMA}}/g, breadcrumbSchema)
                .replace(/{{ANO_ATUAL}}/g, anoAtual)
                .replace(/{{ULTIMA_ATUALIZACAO}}/g, dataHoje)
                .replace(/{{SEO_TEXT_FAQ}}/g, seoText);

            return htmlFinal;
        }

        // Setup para gerar o Sitemap XML
        let urlsParaSitemap = [];
        const ultimaModificacao = new Date().toISOString().split('T')[0];

        // 1. Gerar index.html (Home) - Contém todas as ofertas
        const mesAnoHome = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
        const tituloHome = `Caçador de Ofertas 🎯 | Os Melhores Cupons - ${mesAnoHome}`;
        const descHome = `Encontre cupons de desconto validados em ${mesAnoHome}. Economize agora nas maiores lojas com nossos achadinhos! O seu Caçador de Cupom.`;
        const htmlHome = construirPagina(ofertas, tituloHome, descHome, null, null);
        fs.writeFileSync('index.html', htmlHome);
        console.log("✅ Página gerada: index.html (Principal)");
        urlsParaSitemap.push(`${baseUrl}/index.html`);

        // 2. Gerar páginas individuais por loja e apagar as antigas sem cupons
        const nomesLojas = Object.keys(contagemLojas);
        const slugsAtivos = ['index']; // Mantém o index.html principal

        for (const nomeLoja of nomesLojas) {
            const slugDaLoja = lojasSlugs[nomeLoja];
            const ofertasDestaLoja = ofertas.filter(o => o.loja.trim() === nomeLoja);

            // Não gera a página se a loja não tiver cupons ativos ou ofertas
            if (contagemLojas[nomeLoja] === 0 || ofertasDestaLoja.length === 0) continue;

            const mesAno = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date());
            let tituloLoja = `Cupom de Desconto ${nomeLoja} - ${mesAno} 🤑 | Caçador de Ofertas`;
            let descLoja = `Cupom ${nomeLoja} em ${mesAno}. Pegue agora os melhores cupons validados e promoções com o Caçador de Ofertas.`;
            
            if (nomeLoja.toLowerCase() === 'mercado livre') {
                tituloLoja = `Cupom Mercado Livre (ML) Válido Hoje ✅ - ${mesAno}`;
                descLoja = `Pegue seu Cupom ML Hoje! Lista atualizada de Códigos Meli, Cupons de Desconto Mercado Livre válidos e testados para você economizar agora.`;
            } else if (nomeLoja.toLowerCase() === 'amazon') {
                tituloLoja = `Cupom Amazon: Descontos e Frete Grátis 📦 - ${mesAno}`;
                descLoja = `Pegue seu Cupom de Desconto Amazon! Códigos promocionais para primeira compra, frete grátis, Kindle e muito mais. Testados hoje!`;
            }

            const htmlLoja = construirPagina(ofertasDestaLoja, tituloLoja, descLoja, slugDaLoja, nomeLoja);
            fs.writeFileSync(`${slugDaLoja}.html`, htmlLoja);
            console.log(`✅ Página gerada: ${slugDaLoja}.html (${nomeLoja})`);

            urlsParaSitemap.push(`${baseUrl}/${slugDaLoja}.html`);
            slugsAtivos.push(slugDaLoja);
        }

        // Limpeza de arquivos .html órfãos (lojas removidas ou vazias)
        const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));
        for (const arquivo of htmlFiles) {
            if (arquivo === 'template.html' || arquivo === 'dashboard.html' || arquivo === 'grupo-suplementos.html') continue;
            
            const slugName = arquivo.replace('.html', '');
            if (!slugsAtivos.includes(slugName)) {
                fs.unlinkSync(arquivo);
                console.log(`🗑️ Página apagada: ${arquivo} (Sem cupons válidos)`);
            }
        }

        // 3. Gerar Sitemap.xml para SEO do Google (com changefreq)
        let xmlSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        urlsParaSitemap.forEach(url => {
            const priority = url.includes('index.html') ? '1.0' : '0.8';
            const changefreq = 'daily';
            xmlSitemap += `  <url>\n    <loc>${url}</loc>\n    <lastmod>${ultimaModificacao}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
        });
        xmlSitemap += `</urlset>`;
        fs.writeFileSync('sitemap.xml', xmlSitemap);
        console.log("✅ Sitemap gerado: sitemap.xml");

        // 4. Gerar robots.txt
        const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
        fs.writeFileSync('robots.txt', robotsTxt);
        console.log("✅ robots.txt gerado");

        console.log("🎉 Processo de Geração Estática finalizado!");

    } catch (erro) {
        console.error("❌ Erro ao ler a planilha e gerar o site:", erro);
    }
}

atualizarViaPlanilha();

