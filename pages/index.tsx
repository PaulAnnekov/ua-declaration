import type { NextPage } from 'next'
import Head from 'next/head'
import { XMLParser } from 'fast-xml-parser'
import { Container, Row, Card, Button, Col } from 'react-bootstrap'
import styles from '../styles/Home.module.css'
import { ChangeEvent, Fragment, useState } from 'react'
import Decimal from 'decimal.js'

const MILITARY_TAX_RATE = new Decimal('0.015');

const months: { [key: string]: number; } = {
  'Січень': 1,
  'Лютий': 2,
  'Березень': 3,
  'Квітень': 4,
  'Травень': 5,
  'Червень': 6,
  'Липень': 7,
  'Серпень': 8,
  'Вересень': 9,
  'Жовтень': 10,
  'Листопад': 11,
  'Грудень': 12,
}

// 111 - виграші та призи (мінфін)
// 126 - кешбек/депозит
// 127 - кешбек привата
// 129 - ОВДП
// 110 - корпоративні облігації
// 157 - виплата на ФОП
// 512 - податкова декларація

enum TYPE {
  'CASHBACK_DEPOSIT',
  'GOVERNMENT_BOND',
  'CORPORATE_BOND',
  'OTHER'
}

const taxCodeToType: { [key: number]: TYPE; } = {
  110: TYPE.CORPORATE_BOND,
  126: TYPE.CASHBACK_DEPOSIT,
  127: TYPE.CASHBACK_DEPOSIT,
  129: TYPE.GOVERNMENT_BOND,
}

interface IncomeRecord {
  row: string;
  date: string;
  company: string;
  incomeAccrued: Decimal;
  incomePaid: Decimal;
  taxPdfoAccrued: Decimal;
  taxPdfoPaid: Decimal;
  taxMilitaryPaid: Decimal;
  taxCode: number;
}

interface Totals {
  incomePaid: Decimal;
  taxPdfoPaid: Decimal;
  taxMilitaryPaid: Decimal;
}

interface XmlSchema {
  DECLAR: {
    DECLARBODY: {
      /** day and month */
      T1RXXXXG3S: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** year */
      T1RXXXXG4: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** company name */
      T1RXXXXG6S: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** income accrued */
      T1RXXXXG7: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** income paid */
      T1RXXXXG8: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** tax accrued */
      T1RXXXXG9: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** tax paid */
      T1RXXXXG10: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
      /** tax code */
      T1RXXXXG11S: { 
        '#text': string, 
        '@_ROWNUM': string 
      }[],
    }
  }
}

const Home: NextPage = () => {
  const [income, setIncome] = useState<IncomeRecord[]>([]);
  const [filter, setFilter] = useState<Set<TYPE>>(new Set());

  function formatDecimal(value: Decimal) {
    return `${new Intl.NumberFormat().format(value.toNumber())} ₴`;
  }

  async function onFileChange(event: any) {
    const file = event.target.files[0];
    if (file.type !== 'text/xml') {
      console.log('File is not an image.', file.type, file);
      return;
    }

    const reader = new FileReader();
    const filePromise = new Promise<string>((resolve, reject) => {
      reader.addEventListener('load', (event) => {
        if (!event.target) {
          return reject(new Error('No target'));
        }
        resolve(event.target.result as string);
      });  
    });
    reader.readAsText(file, 'cp1251');
    const text = await filePromise;
    const parser = new XMLParser({
      ignoreAttributes: false
    });
    const xmlObject = parser.parse(text) as XmlSchema;
    const body = xmlObject.DECLAR.DECLARBODY;
    const incomes: IncomeRecord[] = [];
    body.T1RXXXXG3S.forEach(({ '#text': date, '@_ROWNUM': row }) => {
      const [taxCode] = (body.T1RXXXXG11S.find(({ '@_ROWNUM': taxCodeRow }) => taxCodeRow === row)?.['#text'] as string).split(' - ');
      const year = body.T1RXXXXG4.find(({ '@_ROWNUM': yearRow }) => yearRow === row)?.['#text'];
      const incomePaid = new Decimal(body.T1RXXXXG8.find(({ '@_ROWNUM': incomePaidRow }) => incomePaidRow === row)?.['#text'] || 0);
      const taxPdfoPaid = new Decimal(body.T1RXXXXG10.find(({ '@_ROWNUM': taxPaidRow }) => taxPaidRow === row)?.['#text'] || 0);
      incomes.push({
        row,
        date: `${date} ${year}`,
        company: body.T1RXXXXG6S.find(({ '@_ROWNUM': companyRow }) => companyRow === row)?.['#text'] as string,
        incomeAccrued: new Decimal(body.T1RXXXXG7.find(({ '@_ROWNUM': incomeAccruedRow }) => incomeAccruedRow === row)?.['#text'] || 0),
        incomePaid,
        taxPdfoAccrued: new Decimal(body.T1RXXXXG9.find(({ '@_ROWNUM': taxAccruedRow }) => taxAccruedRow === row)?.['#text'] || 0),
        taxPdfoPaid: taxPdfoPaid,
        taxMilitaryPaid: !taxPdfoPaid.isZero() ? incomePaid.times(MILITARY_TAX_RATE).toDP(2) : new Decimal(0),
        taxCode: +taxCode,
      });
    });
    setIncome(incomes);
  }

  function filterChange({ target }: ChangeEvent<HTMLInputElement>, type: TYPE) {
    const newFilter = new Set(filter);
    target.checked ? newFilter.add(type) : newFilter.delete(type);
    setFilter(newFilter);
  }

  const filteredIncome: IncomeRecord[] = [];
  const totals: Totals = {
    incomePaid: new Decimal(0),
    taxPdfoPaid: new Decimal(0),
    taxMilitaryPaid: new Decimal(0),
  };
  income.forEach((record) => {
    const type = taxCodeToType[record.taxCode] !== undefined ? taxCodeToType[record.taxCode] : TYPE.OTHER;
    if (filter.size > 0 && !filter.has(type)) {
      return;
    }
    filteredIncome.push(record);
    totals.incomePaid = totals.incomePaid.plus(record.incomePaid);
    totals.taxPdfoPaid = totals.taxPdfoPaid.plus(record.taxPdfoPaid);
    totals.taxMilitaryPaid = totals.taxMilitaryPaid.plus(record.taxMilitaryPaid);
  });

  return (
    <Container className="md-container d-flex flex-column min-vh-100">
      <Head>
        <title>Податкова декларація</title>
        <link rel="icon" href="/favicon-32x32.png" />
      </Head>
      <header className="py-4">
        <span className="fs-4">Податкова декларація</span>
      </header>
      <Container>
        <Row>
          <Col md={5} sm={12}>
            <ol>
              <li>
                Подайте запит та отримайте &quot;Відомість з Державного реєстру фізичних осіб - платників податків про суми виплачених доходів та утриманих податків&quot; (F1401803)
              </li>
              <li>
                Завантажте відомість та отримайте зручний звіт по сумах <br />
                <input type="file" onChange={onFileChange} accept=".xml" />
              </li>
            </ol>
          </Col>
        </Row>
        {!!income.length && <Row>
          <Col className="mt-5">
            <form>
              <div className="form-check form-check-inline">
                <label>
                  <input className="form-check-input" type="checkbox" onChange={(event) => filterChange(event, TYPE.CASHBACK_DEPOSIT)} checked={filter.has(TYPE.CASHBACK_DEPOSIT)} />
                  Депозити та кешбеки (10.10)
                </label>
              </div>
              <div className="form-check form-check-inline">
                <label>
                  <input className="form-check-input" type="checkbox" onChange={(event) => filterChange(event, TYPE.CORPORATE_BOND)} checked={filter.has(TYPE.CORPORATE_BOND)} />
                  Корпоративні облігації (10.10)
                </label>
              </div>
              <div className="form-check form-check-inline">
                <label>
                  <input className="form-check-input" type="checkbox" onChange={(event) => filterChange(event, TYPE.GOVERNMENT_BOND)} checked={filter.has(TYPE.GOVERNMENT_BOND)} />
                  Державні облігації (11.3)
                </label>
              </div>
              <div className="form-check form-check-inline">
                <label>
                  <input className="form-check-input" type="checkbox" onChange={(event) => filterChange(event, TYPE.OTHER)} checked={filter.has(TYPE.OTHER)} />
                  Інше
                </label>
              </div>
            </form>
          </Col>
        </Row>}
        {!!income.length && <Row>
          <Col>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Дата</th>
                <th scope="col">Компанія</th>
                <th scope="col">Доходу нараховано</th>
                <th scope="col">Доходу виплаченого</th>
                <th scope="col">ПДФО нараховано</th>
                <th scope="col">ПДФО перерахованого</th>
                <th scope="col">Воєнний збір</th>
                <th scope="col">Код та назва ознаки доходу</th>
              </tr>
            </thead>
            <tbody>
            {filteredIncome.map(({ row, date, company, incomeAccrued, incomePaid, taxPdfoAccrued: taxAccrued, taxPdfoPaid, taxMilitaryPaid, taxCode }) => {
              return (
                <tr key={row}>
                  <td>{date}</td>
                  <td>{company}</td>
                  <td>{formatDecimal(incomeAccrued)}</td>
                  <td>{formatDecimal(incomePaid)}</td>
                  <td>{formatDecimal(taxAccrued)}</td>
                  <td>{formatDecimal(taxPdfoPaid)}</td>
                  <td>{formatDecimal(taxMilitaryPaid)}</td>
                  <td>{taxCode.toString()}</td>
                </tr>
              )
            })}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td></td>
                <td></td>
                <td>{formatDecimal(totals.incomePaid)}</td>
                <td></td>
                <td>{formatDecimal(totals.taxPdfoPaid)}</td>
                <td>{formatDecimal(totals.taxMilitaryPaid)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          </Col>
        </Row>}
      </Container>
      <footer className="mt-auto py-3">
        <a href="https://paul.annekov.com/">Павло Аннеков</a> 🇺🇦 2022
      </footer>
    </Container>
  )
}

export default Home
