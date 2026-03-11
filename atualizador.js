const fs = require('fs');

async function buscarOfertas() {
    console.log("A iniciar a busca de ofertas...");
    
    // Aqui no futuro colocaremos o link real da API do Mercado Livre
    // const resposta = await fetch('URL_DA_API');
    // const dados = await resposta.json();

    // Dados simulados para testar o motor
    const ofertas = [
        {
            "loja": "ML",
            "titulo": "Teste Automático via GitHub Actions",
            "descricao": "O robô funcionou e atualizou a página sozinho!",
            "codigo": "ROBO-ATIVO",
            "link": "https://mercadolivre.com.br",
            "ativo": true
        }
    ];

    // Transforma a lista e guarda no ficheiro cupons.json
    fs.writeFileSync('cupons.json', JSON.stringify(ofertas, null, 2));
    console.log("Ficheiro cupons.json reescrito com sucesso!");
}

buscarOfertas();
