ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS street_number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS birth_date date;

INSERT INTO public.app_settings (key, value) VALUES ('warranty_service_order', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value) VALUES ('warranty_lacrado', $tx$DO OBJETO

Cláusula 1ª: O comprador está adquirindo o produto descrito acima, em plenas condições de uso, devidamente lacrado, testado, concordando com todas as características, inexistindo qualquer defeito, mediante valor e forma de pagamento ajustado entre as partes.

Cláusula 2ª: Por tratar-se de um aparelho lacrado, o item acompanha manual impresso pelo fabricante, mas também poderá ser extraído diretamente no site do fabricante, sendo esse: https://support.apple.com/pt-br/guide/iphone/welcome/ios.

DAS OBRIGAÇÕES DO COMPRADOR

Cláusula 3ª: A [Loja] orienta o comprador a não expor o celular a líquidos ou poeira, tendo em vista que a própria fabricante do aparelho aduz que a resistência contra respingos, líquidos e poeira não é uma condição permanente e pode diminuir com o tempo, gerando assim maior durabilidade do celular.

Cláusula 4ª: O consumidor se compromete a utilizar o aparelho celular com proteção adequada, itens originais do fabricante ou homologados, bem como a instalar apenas aplicativos fornecidos no sistema da fabricante (Apple Store).

DAS OBRIGAÇÕES DA VENDEDORA

Cláusula 5ª: Na hipótese de o produto apresentar falha ou vício de fabricação dentro do prazo de garantia, o consumidor deverá procurar imediatamente a fabricante Apple, não sendo permitido que terceiros avaliem ou reparem o produto, sob pena do comprador ser responsável por tal ato, eximindo a [Loja] do dever de reparar, além da perda da garantia junto ao fabricante.

Cláusula 6ª: A [Loja] prestará total auxílio ao comprador, informando todo o procedimento necessário para exercer sua garantia junto ao fabricante.

Cláusula 7ª: Caso seja necessário o reparo e formatação do aparelho celular, é responsabilidade do comprador manter atualizado o backup se assim entender, não sendo a [Loja] responsável pela perda dos dados, contatos, imagens, vídeos etc.

DA GARANTIA DO PRODUTO

Cláusula 8ª: A garantia do produto terá validade por 12 meses, contados do recebimento ou retirada em loja, garantia essa fornecida pelo próprio fabricante e que deverá ser acionada seguindo os procedimentos internos da Apple.

Cláusula 9ª: A garantia do produto cessará nos seguintes casos:
- Não sejam seguidas as recomendações de conservação e uso contidas no manual de instrução do próprio fabricante;
- Seja constatado defeito no produto decorrente de negligência, imperícia ou mau uso pelo próprio consumidor;
- O produto seja examinado, adulterado ou consertado por terceiros sem autorização da [Loja];
- Houver remoção e/ou alteração do número de série do equipamento ou de quaisquer dos seus componentes internos;
- O produto tiver o lacre/selo violado, quando houver;
- Caso ocorra a utilização de hardware, peça ou componente não original ou homologadas;
- Caso ocorra alteração/modificação do software ou sistema operacional original do produto;
- Caso seja constatado danos físicos ou químicos internos ou externos ao produto decorrente de choque, queda, ato e efeito causado por ação de agentes da natureza, líquidos, oxidação, oscilações de tensão elétrica, exposição excessiva ao calor ou pressão excessiva na tela;
- Quando for constatado que o defeito foi causado por equipamento a ele conectado;
- Desgaste natural em razão do envelhecimento do produto;
- Danos estéticos, incluindo arranhões, amassados e rachaduras no produto.

Cláusula 10ª: Caso a [Loja] ou a fabricante receba o aparelho celular para exercício da garantia e constate uma das ilegalidades supracitadas, o comprador será comunicado imediatamente sobre a não cobertura do reparo de forma gratuita.

Cláusula 11ª: Após a constatação e comunicação do comprador, o aparelho ficará disponível para retirada em loja mediante agendamento.

DISPOSIÇÕES GERAIS

Cláusula 13ª: Ao assinar o presente contrato, o comprador concorda que a [Loja] poderá utilizar suas imagens sejam elas mediante vídeo ou fotografia, nas redes sociais da loja, para fins comerciais e de marketing.

Cláusula 14ª: A cessão dos direitos de uso e reprodução da imagem do comprador não gera nenhum ônus lucrativo ao cedente, ocorrendo de forma gratuita e voluntária.

Cláusula 15ª: O comprador concorda que a única empresa participante da negociação deste produto é a [Loja], registrada no CNPJ informado anteriormente.

Cláusula 16ª: A garantia elencada no presente contrato deverá ser exercida exclusivamente pelo comprador qualificado neste ato junto ao fabricante.$tx$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.app_settings (key, value) VALUES ('warranty_seminovo', $tx$Cláusula II – Garantia

Asseguramos ao consumidor deste produto garantia de 3 meses, contando sempre a partir da data do recebimento da mercadoria. Entende-se por "garantia", o reparo gratuito do aparelho e a reposição de peças, ou troca do aparelho que, de acordo com o nosso parecer técnico e dentro do prazo acima, que apresentarem defeitos. Não realizamos reembolso.

Para que nosso serviço autorizado receba o produto em garantia, é indispensável que o mesmo esteja acompanhado do certificado de garantia e selo (localizado na parte inferior do conector do celular) caso contrário, fica claro desde já, que o produto estará sendo recebido fora da garantia, ficando claro que o conserto será por conta do consumidor, mesmo que posteriormente, esse documento venha ser apresentado.

Observações:

Trabalhamos com iPhones Novos e Seminovos sem caixa, acompanhando apenas o cabo do carregador de brinde; a bateria do mesmo podendo variar de 80% a 100% da saúde de vida, excelentes e bem conservados para o uso e podendo haver alguma substituição de componente no aparelho não originais do fabricante porém de qualidade igual e testado. Não serão aceitos aparelhos bloqueados (iCloud ativo), pois fica inviável manusear o mesmo. Não oferecemos garantia relacionada a queda da saúde da bateria, pois é algo relacionado ao tipo de uso do comprador.

Fica automaticamente cancelada a garantia legal se vierem ocorrer quaisquer das condições:
- Danos no aparelho provocado por: queda, batidas, descarga atmosférica (raio), inundação, desabamento, fogo, umidade, transpiração, exposição a luz solar, salinidade, exposição a rede elétrica imprópria, sinal de violações internas e externas ou ainda, alterações da configuração do produto, que venham comprometer a integridade dos componentes originais.
- Se o certificado de garantia de compra do produto apresentarem adulterações e/ou rasuras.
- Se o número de série ou selos forem removidos ou apresentarem adulterações e/ou rasuras, ou ainda não forem coincidentes com a numeração da placa do produto.

Procedimento de Garantia para troca ou reparo:

Caso seja necessário o acionamento da garantia devido a algum problema técnico do aparelho que esteja dentro das normas da garantia, fica de responsabilidade do cliente o deslocamento até o escritório da Loja com data e horário Pré-Agendado, onde o aparelho será levado para análise de reparo ou troca do mesmo. Esse procedimento pode variar de 1 a 7 dias úteis dependendo do caso e disponibilidade dos técnicos.$tx$)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;