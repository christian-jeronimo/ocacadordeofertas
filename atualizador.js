const fs = require('fs');

// COLE O LINK DA SUA PLANILHA AQUI (Tem que ser o link gerado no "Publicar na Web")
const urlPlanilha = 'https://docs.google.com/spreadsheets/d/1FSQAX-oL9sH_CSZ0g2mVLVEOGtI4KZiglo5XYm8Wdlc/edit?usp=sharing';

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
        console.log(`✅ Sucesso! ${ofertas.length} ofertas atualizadas a partir da planilha.`);

    } catch (erro) {
        console.error("❌ Erro ao ler a planilha:", erro);
    }
}

atualizarViaPlanilha();
