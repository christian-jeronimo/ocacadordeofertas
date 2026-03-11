const fs = require('fs');

async function buscarOfertas() {
    console.log("Conectando à API do Mercado Livre...");

    try {
        // 1. Fazemos a busca na API oficial (Exemplo: buscando as melhores ofertas de 'suplementos')
        // Você pode trocar 'suplementos' por 'notebook', 'whey', ou o nicho que preferir
        const resposta = await fetch('https://api.mercadolibre.com/sites/MLB/search?q=suplementos&limit=6');
        const dados = await resposta.json();

        // 2. Transformamos os dados brutos da loja no formato do nosso site
        const ofertas = dados.results.map(produto => {
            
            // Aqui você pode montar o seu link de afiliada
            // Geralmente, os links de afiliado do ML têm um formato que redireciona para o permalink
            const linkAfiliado = produto.permalink; // Substituiremos pela sua estrutura de afiliada depois
            
            return {
                loja: "Mercado Livre",
                titulo: produto.title.substring(0, 45) + "...", // Corta títulos muito grandes
                descricao: `Preço especial: R$ ${produto.price.toFixed(2)}`,
                codigo: "ATIVAR", // Como o desconto costuma ser direto no link, usamos 'ATIVAR'
                link: linkAfiliado,
                ativo: true
            };
        });

        // 3. Salva os novos produtos no nosso banco de dados JSON
        fs.writeFileSync('cupons.json', JSON.stringify(ofertas, null, 2));
        console.log("Ofertas reais baixadas e salvas com sucesso!");

    } catch (erro) {
        console.error("Erro ao buscar ofertas na API:", erro);
    }
}

buscarOfertas();
