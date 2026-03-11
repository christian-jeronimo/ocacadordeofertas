const fs = require('fs');

async function buscarOfertas() {
    console.log("A ligar à API do Mercado Livre...");

    try {
        // 1. Fazemos a busca, mas agora com um "disfarce" (User-Agent) para não sermos bloqueados
        const resposta = await fetch('https://api.mercadolibre.com/sites/MLB/search?q=suplementos&limit=6', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        const dados = await resposta.json();

        // 2. Trava de segurança: Verifica se a loja enviou mesmo os produtos
        if (!dados || !dados.results) {
            console.error("❌ A API não devolveu a lista de produtos. Resposta recebida:", JSON.stringify(dados));
            return; // Interrompe o processo para não estragar o site
        }

        console.log(`Sucesso! Encontrados ${dados.results.length} produtos.`);

        // 3. Transformamos os dados brutos da loja no formato do nosso site
        const ofertas = dados.results.map(produto => {
            const linkAfiliado = produto.permalink; 
            
            return {
                loja: "Mercado Livre",
                titulo: produto.title.substring(0, 45) + "...", 
                descricao: `Preço especial: R$ ${produto.price.toFixed(2)}`,
                codigo: "ATIVAR", 
                link: linkAfiliado,
                ativo: true
            };
        });

        // 4. Guarda os novos produtos no nosso ficheiro JSON
        fs.writeFileSync('cupons.json', JSON.stringify(ofertas, null, 2));
        console.log("✅ Ofertas reais descarregadas e guardadas com sucesso no ficheiro!");

    } catch (erro) {
        console.error("❌ Erro técnico ao buscar ofertas:", erro);
    }
}

buscarOfertas();
