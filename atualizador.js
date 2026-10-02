const fs = require('fs');
const path = require('path');

// COLE O LINK DA SUA PLANILHA AQUI (Tem que ser o link gerado no "Publicar na Web")
const urlPlanilha = process.env.URL_PLANILHA_TSV || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR2REpLC9EdFoSD2Fs5kl7MjOeEhYzSjoi7152nupjhb-rGMC8zkkkd3qB8c3ZroDljaklkkA35pXbZ/pub?output=tsv';

// DOMÍNIO REAL DO SITE (usado no sitemap, canonical URLs e robots.txt)
const baseUrl = 'https://cacadordeofertas.com.br';
const pastaSaida = process.env.GERADOR_SAIDA_DIR || __dirname;
const lojasPersistentes = ['Mercado Livre', 'Amazon'];

const fusoHorario = 'America/Sao_Paulo';
const diasSemReconfirmacao = 7;

function normalizarCabecalho(valor) {
    return String(valor || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function normalizarNomeCampo(valor) {
    const campo = normalizarCabecalho(valor);
    if (['aprovadoem', 'conferidoem', 'validadoem'].includes(campo)) {
        return campo === 'aprovadoem' ? 'aprovado_em' : 'conferido_em';
    }
    if (['datavalidade', 'expiracao', 'validuntil'].includes(campo)) return 'validade';
    return campo;
}

function converterDataPlanilha(valor) {
    if (!valor) return null;
    const texto = String(valor).trim();
    let partes;
    if ((partes = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
        return validarDataUtc(Number(partes[1]), Number(partes[2]), Number(partes[3]), texto);
    }
    if ((partes = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+.*)?$/))) {
        return validarDataUtc(Number(partes[3]), Number(partes[2]), Number(partes[1]), texto);
    }
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) {
        return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()));
    }
    throw new Error(`Data inválida na planilha: "${texto}".`);
}

function validarDataUtc(ano, mes, dia, textoOriginal) {
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
        throw new Error(`Data inválida na planilha: "${textoOriginal}".`);
    }
    return data;
}

function dataHojeNoFuso() {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: fusoHorario, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valores = Object.fromEntries(partes.map(parte => [parte.type, parte.value]));
    return new Date(Date.UTC(Number(valores.year), Number(valores.month) - 1, Number(valores.day)));
}

function formatarDataConferencia(valor) {
    const data = converterDataPlanilha(valor);
    return data ? data.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
}

function ofertaEstaAprovada(status) {
    return ['aprovado', 'aprovada', 'publicado', 'publicada', 'expirado', 'expirada', 'rever'].includes(
        String(status || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    );
}

function prepararOfertasTSV(textoTSV) {
    const texto = String(textoTSV || '').replace(/^\uFEFF/, '').trim();
    if (!texto || /^<!doctype html|^<html/i.test(texto)) {
        throw new Error('O endereço do Google Sheets retornou uma página vazia ou HTML, em vez de TSV.');
    }

    const linhas = texto.split(/\r?\n/);
    const cabecalhos = linhas[0].split('\t').map(h => h.trim());
    const indices = Object.fromEntries(cabecalhos.map((nome, indice) => [normalizarCabecalho(nome), indice]));
    const obrigatorios = ['loja', 'titulo', 'descricao', 'codigo', 'link', 'ativo'];
    const ausentes = obrigatorios.filter(nome => indices[normalizarCabecalho(nome)] === undefined);
    if (ausentes.length) {
        throw new Error(`TSV do Google Sheets sem colunas obrigatórias: ${ausentes.join(', ')}.`);
    }

    const temColunaStatus = indices.status !== undefined;
    const hoje = dataHojeNoFuso();
    const ofertas = [];
    let linhasIgnoradas = 0;

    for (let numeroLinha = 1; numeroLinha < linhas.length; numeroLinha++) {
        if (!linhas[numeroLinha].trim()) continue;
        const valores = linhas[numeroLinha].split('\t');
        const produto = {};
        cabecalhos.forEach((cabecalho, indice) => {
            produto[normalizarNomeCampo(cabecalho)] = valores[indice] ? valores[indice].trim() : '';
        });

        const valorStatus = String(produto.status || '').trim();
        if (temColunaStatus && valorStatus && !ofertaEstaAprovada(valorStatus)) {
            linhasIgnoradas++;
            continue;
        }

        const valorAtivo = String(produto.ativo || '').trim().toLowerCase();
        let ativo = ['true', 'verdadeiro', 'sim', '1'].includes(valorAtivo);
        const statusNormalizado = valorStatus.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (['expirado', 'expirada', 'rever'].includes(statusNormalizado)) {
            ativo = false;
        }

        const validade = produto.validade || '';
        const conferidoEm = produto.aprovado_em || produto.conferido_em || '';
        if (valorStatus && ofertaEstaAprovada(valorStatus) && ativo) {
            if (validade) {
                if (hoje > converterDataPlanilha(validade)) ativo = false;
            } else if (conferidoEm) {
                const dataConferencia = converterDataPlanilha(conferidoEm);
                const diasDesdeConferencia = Math.floor((hoje.getTime() - dataConferencia.getTime()) / 86400000);
                if (diasDesdeConferencia >= diasSemReconfirmacao) ativo = false;
            } else {
                ativo = false;
            }
        }

        produto.ativo = ativo;
        ofertas.push(produto);
    }

    if (linhasIgnoradas) {
        console.log(`ℹ️ ${linhasIgnoradas} linha(s) ignorada(s) por não estarem aprovadas.`);
    }
    return ofertas;
}

function criarSlug(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function atualizarViaPlanilha() {
    console.log("Conectando ao Google Sheets...");

    try {
        const resposta = await fetch(urlPlanilha, { signal: AbortSignal.timeout(15000) });
        if (!resposta.ok) throw new Error(`Google Sheets respondeu com HTTP ${resposta.status}.`);
        const textoTSV = await resposta.text();
        const ofertas = prepararOfertasTSV(textoTSV);

        // Salva os produtos no nosso banco de dados JSON
        fs.mkdirSync(pastaSaida, { recursive: true });
        fs.writeFileSync(path.join(pastaSaida, 'cupons.json'), JSON.stringify(ofertas, null, 2));
        console.log(`✅ Sucesso! JSON gerado: ${ofertas.length} ofertas salvas.`);

        // --- INÍCIO DA GERAÇÃO ESTÁTICA (SSG) ---
        console.log("Iniciando geração das páginas estáticas (SSG)...");

        const templateHtml = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');

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

        // Páginas de lojas já publicadas continuam acessíveis quando os cupons acabam.
        lojasPersistentes.forEach(loja => {
            if (contagemLojas[loja] === undefined) contagemLojas[loja] = 0;
            lojasSlugs[loja] = 'cupom-' + criarSlug(loja);
        });

        // Função auxiliar para gerar o menu de lojas
        function gerarMenuLojas(lojaAtualSlug = null) {
            let htmlMenu = `<a href="/" class="store-chip ${lojaAtualSlug === null ? 'active' : ''}">Todas as Ofertas</a>`;

            // Ordenar lojas pelo nome
            const lojasOrdenadas = Object.keys(contagemLojas).sort((a, b) => a.localeCompare(b));

            lojasOrdenadas.forEach(lojaNome => {
                const count = contagemLojas[lojaNome];
                if (count === 0 && !lojasPersistentes.includes(lojaNome)) return;

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
            const ofertasUnicas = [];
            const chavesVistas = new Set();
            listaOfertas.forEach(cupom => {
                const chave = [cupom.loja, cupom.codigo, cupom.titulo, cupom.descricao, cupom.link, cupom.ativo].map(valor => String(valor || '').trim().toLowerCase()).join('|');
                if (chavesVistas.has(chave)) return;
                chavesVistas.add(chave);
                ofertasUnicas.push(cupom);
            });

            ofertasUnicas.forEach(cupom => {
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
                    const dataConferencia = cupom.conferido_em || cupom.aprovado_em || '';
                    const textoDataConferencia = dataConferencia ? formatarDataConferencia(dataConferencia) : '';
                    const textoValidade = cupom.validade ? formatarDataConferencia(cupom.validade) : '';
                    htmlAtivos += `
                        <article class="coupon-card">
                            <div class="store-logo">${cupom.loja}</div>
                            <div class="coupon-info">
                                <h3>${cupom.titulo}</h3>
                                <p>${cupom.descricao}</p>
                                ${textoValidade ? `<p class="coupon-date">Validade informada: ${textoValidade}</p>` : ''}
                                ${textoDataConferencia ? `<p class="coupon-date">Conferido em: ${textoDataConferencia}</p>` : ''}
                            </div>
                            ${htmlBotaoAtivo}
                        </article>
                    `;

                    schemaOfertas.push({
                        "@type": "Offer",
                        "name": cupom.titulo + " em " + cupom.loja,
                        "description": cupom.descricao,
                        "url": cupom.link,
                        ...(cupom.validade ? { "validThrough": converterDataPlanilha(cupom.validade).toISOString().slice(0, 10) } : {})
                    });

                } else {
                    const statusInativo = String(cupom.status || '').trim().toLowerCase() === 'rever'
                        ? 'AGUARDANDO RECONFIRMAÇÃO'
                        : 'EXPIRADO';
                    htmlExpirados += `
                        <article class="coupon-card expired">
                            <div class="expired-badge">${statusInativo}</div>
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

            if (htmlAtivos === '') { htmlAtivos = `<p class="empty-offers">Nenhum cupom ativo informado no momento. Confira as condições diretamente na loja antes de comprar.</p>` }
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
            const { htmlAtivos, htmlExpirados, schemaLd } = gerarCardsESchema(listaOfertas, nomeLoja);

            const nomeArquivo = slug ? `${slug}.html` : 'index.html';
            const canonicalUrl = nomeArquivo === 'index.html' ? `${baseUrl}/` : `${baseUrl}/${nomeArquivo}`;
            const keywords = gerarKeywords(nomeLoja);
            
            const menuHtml = gerarMenuLojas(slug);
            const breadcrumbSchema = gerarBreadcrumbSchema(nomeArquivo, nomeLoja);
            const headerTitle = nomeLoja === 'Mercado Livre'
                ? 'Cupons do Mercado Livre: códigos e ofertas'
                : nomeLoja === 'Amazon' ? 'Cupons e ofertas da Amazon'
                : nomeLoja ? `Cupons e ofertas ${nomeLoja}` : 'Caçador de Ofertas';
            const headerSubtitle = nomeLoja
                ? `Veja as ofertas informadas para ${nomeLoja} e confira as condições antes de comprar.`
                : 'Cupons e promoções com condições informadas';
            const introLoja = nomeLoja === 'Mercado Livre' ? `
                <section class="page-intro" aria-label="Sobre os cupons do Mercado Livre">
                    <p>Procura um cupom ML para usar agora? Veja abaixo os códigos disponíveis e as condições informadas para cada oferta. A elegibilidade pode depender do produto, da conta e do estoque.</p>
                    <p>Toque em <strong>PEGAR CUPOM</strong> para copiar o código, abra o Mercado Livre e confirme o desconto no carrinho antes de pagar.</p>
                </section>` : '';
            let seoText = '';
            if (nomeLoja) {
                if (nomeLoja.toLowerCase() === 'mercado livre') {
                    seoText = `
                    <article class="seo-text-area">
                        <h2>Como escolher um código do Mercado Livre</h2>
                        <p>Compare o desconto, a compra mínima, o limite de abatimento, as categorias participantes e a validade descritos em cada cupom. Um código disponível na lista ainda pode depender das regras da sua conta ou de produtos específicos.</p>
                        
                        <h3>Como aplicar o cupom?</h3>
                        <p>Revele e copie o código. No aplicativo ou site do Mercado Livre, adicione um produto elegível ao carrinho, insira o código no campo de cupons e confira o valor final antes de concluir o pedido.</p>
                        
                        <h3>Por que um código pode não funcionar?</h3>
                        <p>A oferta pode ter atingido o limite de uso, exigir uma compra mínima ou se aplicar apenas a produtos e contas elegíveis. Se o desconto não aparecer no carrinho, não conclua a compra contando com ele.</p>
                    </article>`;
                } else {
                    seoText = `
                    <article class="seo-text-area">
                        <h2>Cupons e ofertas de ${nomeLoja}</h2>
                        <p>Confira as condições informadas em cada cupom. A disponibilidade e a elegibilidade podem variar conforme o produto, a conta e as regras da loja. Confirme o desconto no carrinho antes de concluir a compra.</p>
                        
                        <h3>Como usar um cupom?</h3>
                        <p>Clique em "PEGAR CUPOM" para revelar e copiar o código. Insira-o no campo indicado pela loja e confira as condições antes de pagar.</p>
                        
                        <h3>O que conferir antes de comprar?</h3>
                        <p>Leia o valor mínimo, as categorias participantes, a validade e as restrições descritas na oferta. A loja confirma a aplicação do desconto no carrinho.</p>
                    </article>`;
                }
            } else {
                seoText = `
                <article class="seo-text-area">
                    <h2>Cupons e ofertas</h2>
                    <p>Veja as condições informadas em cada oferta, revele o código quando houver e confira sua aplicação no carrinho da loja parceira. A disponibilidade pode mudar conforme as regras da loja.</p>
                    <h3>Como usar um cupom</h3>
                    <p>Abra a oferta, copie o código e aplique-o no campo indicado pela loja. Confira o valor final antes de concluir a compra.</p>
                </article>`;
            }

            let htmlFinal = templateHtml
                .replace(/{{TITLE}}/g, title)
                .replace(/{{META_DESCRIPTION}}/g, metadescription)
                .replace(/{{META_KEYWORDS}}/g, keywords)
                .replace(/{{CANONICAL_URL}}/g, canonicalUrl)
                .replace(/{{HEADER_TITLE}}/g, headerTitle)
                .replace(/{{HEADER_SUBTITLE}}/g, headerSubtitle)
                .replace(/{{INTRO_LOJA}}/g, introLoja)
                .replace(/{{CONTEUDO_ATIVOS}}/g, htmlAtivos)
                .replace(/{{CONTEUDO_EXPIRADOS}}/g, htmlExpirados)
                .replace(/{{SCHEMA_ORG}}/g, schemaLd)
                .replace(/{{MENU_LOJAS}}/g, menuHtml)
                .replace(/{{BREADCRUMB_SCHEMA}}/g, breadcrumbSchema)
                .replace(/{{SEO_TEXT_FAQ}}/g, seoText)
                .replace(/{{ANO_ATUAL}}/g, String(dataHojeNoFuso().getUTCFullYear()));

            return htmlFinal.replace(/[ \t]+$/gm, '');
        }

        // Setup para gerar o Sitemap XML
        let urlsParaSitemap = [];
        // Datas de build não representam alterações reais de conteúdo.

        // 1. Gerar index.html (Home) - Contém todas as ofertas
        const tituloHome = 'Caçador de Ofertas | Cupons e Promoções';
        const descHome = 'Confira cupons e promoções com condições informadas e links para lojas parceiras. Aplique o cupom no carrinho e confirme o desconto antes de pagar.';
        const htmlHome = construirPagina(ofertas, tituloHome, descHome, null, null);
        fs.writeFileSync(path.join(pastaSaida, 'index.html'), htmlHome);
        console.log("✅ Página gerada: index.html (Principal)");
        urlsParaSitemap.push(`${baseUrl}/`);

        // 2. Gerar páginas individuais por loja e apagar as antigas sem cupons
        const nomesLojas = Object.keys(contagemLojas);
        const slugsAtivos = ['index']; // Mantém o index.html principal

        for (const nomeLoja of nomesLojas) {
            const slugDaLoja = lojasSlugs[nomeLoja];
            const ofertasDestaLoja = ofertas.filter(o => o.loja.trim() === nomeLoja);

            // Preserva as páginas das lojas principais mesmo sem cupons ativos.
            if (contagemLojas[nomeLoja] === 0 && !lojasPersistentes.includes(nomeLoja)) continue;

            let tituloLoja = `Cupons e Ofertas ${nomeLoja} | Caçador de Ofertas`;
            let descLoja = `Confira cupons e ofertas de ${nomeLoja}, leia as condições e confirme o desconto no carrinho da loja.`;
            
            if (nomeLoja.toLowerCase() === 'mercado livre') {
                tituloLoja = 'Cupom Mercado Livre: códigos e ofertas | Caçador de Ofertas';
                descLoja = 'Veja cupons do Mercado Livre, descontos e condições informadas. Copie o código e confirme sua aplicação no carrinho antes de pagar.';
            } else if (nomeLoja.toLowerCase() === 'amazon') {
                tituloLoja = 'Cupons e Ofertas Amazon | Caçador de Ofertas';
                descLoja = 'Confira os cupons e as condições das ofertas Amazon. Confirme a aplicação do desconto no carrinho antes de pagar.';
            }

            const htmlLoja = construirPagina(ofertasDestaLoja, tituloLoja, descLoja, slugDaLoja, nomeLoja);
            fs.writeFileSync(path.join(pastaSaida, `${slugDaLoja}.html`), htmlLoja);
            console.log(`✅ Página gerada: ${slugDaLoja}.html (${nomeLoja})`);

            urlsParaSitemap.push(`${baseUrl}/${slugDaLoja}.html`);
            slugsAtivos.push(slugDaLoja);
        }

        // Somente páginas de lojas são geradas a partir do feed. Preserve páginas institucionais.
        const htmlFiles = fs.readdirSync(pastaSaida).filter(f => /^cupom-.*\.html$/.test(f));
        for (const arquivo of htmlFiles) {
            const slugName = arquivo.replace('.html', '');
            if (!slugsAtivos.includes(slugName)) {
                fs.unlinkSync(path.join(pastaSaida, arquivo));
                console.log(`🗑️ Página apagada: ${arquivo} (Sem cupons válidos)`);
            }
        }

        // 3. Gerar sitemap sem datas ou frequências artificiais.
        let xmlSitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
        urlsParaSitemap.forEach(url => {
            xmlSitemap += `  <url>\n    <loc>${url}</loc>\n  </url>\n`;
        });
        xmlSitemap += `</urlset>`;
        fs.writeFileSync(path.join(pastaSaida, 'sitemap.xml'), xmlSitemap);
        console.log("✅ Sitemap gerado: sitemap.xml");

        // 4. Gerar robots.txt
        const robotsTxt = `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
        fs.writeFileSync(path.join(pastaSaida, 'robots.txt'), robotsTxt);
        console.log("✅ robots.txt gerado");

        console.log("🎉 Processo de Geração Estática finalizado!");

    } catch (erro) {
        console.error("❌ Erro ao ler a planilha e gerar o site:", erro);
        process.exitCode = 1;
    }
}

atualizarViaPlanilha();
