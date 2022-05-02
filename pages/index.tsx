import type { NextPage } from 'next'
import Head from 'next/head'
import { XMLParser } from 'fast-xml-parser'
import { Container, Row, Col, ToastContainer, Alert } from 'react-bootstrap'
import { ChangeEvent, useState } from 'react'
import Decimal from 'decimal.js'
import icon from '../public/icon.svg'
import Image from 'next/image'
import Toast, { TOAST_TYPE } from '../components/toast'

const MILITARY_TAX_RATE = new Decimal('0.015');

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
  incomeAccrued: Decimal;
  taxPdfoPaid: Decimal;
  taxMilitaryPaid: Decimal;
}

interface XmlSchema {
  DECLAR: {
    /** form code, must be "F1401803.XSD" */
    '@_xsi:noNamespaceSchemaLocation': string;
    DECLARBODY: {
      /** quarter from */
      R0401G1: number;
      /** year from */
      R0401G2: number;
      /** quarter to */
      R0401G3: number;
      /** year to */
      R0401G4: number;
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
  const [xmlForm, setXmlForm] = useState<XmlSchema>();
  const [filter, setFilter] = useState<Set<TYPE>>(new Set());
  const [error, setError] = useState<string>();

  function formatDecimal(value: Decimal) {
    return `${new Intl.NumberFormat().format(value.toNumber())} ₴`;
  }

  function getIncomes(xmlObject: XmlSchema) {
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

    return incomes;
  }

  async function onFileChange(event: any) {
    if (!event.target.files.length) {
      return;
    }
    const file = event.target.files[0];
    if (file.type !== 'text/xml') {
      setError("Тип файлу не є XML");
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
    reader.readAsText(file, 'windows-1251');
    let text;
    try {
      text = await filePromise;
    } catch(e) {
      setError("Не вдалося прочитати файл");
      console.error(e);
      return;
    }
    const parser = new XMLParser({
      ignoreAttributes: false
    });
    let xmlObject;
    try {
      xmlObject = parser.parse(text) as XmlSchema;
    } catch(e) {
      setError("Формат контенту файлу не є XML");
      console.error(e);
      return;
    }
    if (xmlObject.DECLAR['@_xsi:noNamespaceSchemaLocation'] !== 'F1401803.XSD') {
      setError("Файл не є формою F1401803");
      return;
    }
    try {
      getIncomes(xmlObject);
    } catch(e) {
      setError("Не вдалося прочитати дані з файлу, напишіть розробнику");
      console.error(e);
      return;
    }
    setError(undefined);
    setXmlForm(xmlObject);
  }

  function filterChange({ target }: ChangeEvent<HTMLInputElement>, type: TYPE) {
    const newFilter = new Set(filter);
    target.checked ? newFilter.add(type) : newFilter.delete(type);
    setFilter(newFilter);
  }

  let income: IncomeRecord[] = [];
  let from: string = '';
  let to: string = '';
  let isWaryPeriod = false;
  if (xmlForm) {
    income = getIncomes(xmlForm);
    const body = xmlForm.DECLAR.DECLARBODY;
    from = `${body.R0401G1} кв ${body.R0401G2}`;
    to = `${body.R0401G3} кв ${body.R0401G4}`;
    if (body.R0401G2 !== body.R0401G4 || body.R0401G1 !== 1 || body.R0401G3 !== 4) {
      isWaryPeriod = true;
    }
  }


  const filteredIncome: IncomeRecord[] = [];
  const declarationNumbers = {
    otherIncome: new Decimal(0),
    taxPdfoOtherIncome: new Decimal(0),
    taxMilitaryOtherIncome: new Decimal(0),
    noTaxIncome: new Decimal(0),
  };
  const totals: Totals = {
    incomeAccrued: new Decimal(0),
    taxPdfoPaid: new Decimal(0),
    taxMilitaryPaid: new Decimal(0),
  };
  income.forEach((record) => {
    const type = taxCodeToType[record.taxCode] !== undefined ? taxCodeToType[record.taxCode] : TYPE.OTHER;
    if ([TYPE.CASHBACK_DEPOSIT, TYPE.CORPORATE_BOND].includes(type)) {
      declarationNumbers.otherIncome = declarationNumbers.otherIncome.plus(record.incomeAccrued);
      declarationNumbers.taxPdfoOtherIncome = declarationNumbers.taxPdfoOtherIncome.plus(record.taxPdfoPaid);
      declarationNumbers.taxMilitaryOtherIncome = declarationNumbers.taxMilitaryOtherIncome.plus(record.taxMilitaryPaid);
    }
    if (TYPE.GOVERNMENT_BOND === type) {
      declarationNumbers.noTaxIncome = declarationNumbers.noTaxIncome.plus(record.incomeAccrued);
    }
    if (filter.size > 0 && !filter.has(type)) {
      return;
    }
    filteredIncome.push(record);
    totals.incomeAccrued = totals.incomeAccrued.plus(record.incomeAccrued);
    totals.taxPdfoPaid = totals.taxPdfoPaid.plus(record.taxPdfoPaid);
    totals.taxMilitaryPaid = totals.taxMilitaryPaid.plus(record.taxMilitaryPaid);
  });

  return (
    <Container className="md-container d-flex flex-column min-vh-100">
      <Head>
        <title>Податкова декларація</title>
        <link rel="icon" href="/favicon.png" />
      </Head>
      <header className="py-4 d-flex align-items-center">
        <Image src={icon} width={48} height={48} alt="icon"></Image>
        <span className="fs-4 ms-2">Податкова декларація</span>
      </header>
      <Container>
        <Row>
          <Col><h2>Що це та як користуватись?</h2></Col>
        </Row>
        <Row>
          <Col>
            <p>
              Щороку до 1 травня ви можете добровільно подати декларацію про майновий стан за попередній рік. Якщо у вас є
              доходи, про які податкова не знає, припустимо, ви торгували акціями через іноземного брокера, то декларацію 
              подавати <strong>обов&apos;язково</strong>. У декларації зазначаються не лише всі доходи за попередній рік 
              (зарплата, доходи ФОП, облігації, дивіденди, депозити, ...), але й майно оформлене на вас (авто, квартири, 
              яхти, ...).
            </p>
            <p>
              Більш детально про процедуру подання декларації сказано у <a href="https://www.youtube.com/watch?v=sV7c_myExiM">цьому відео</a>.
            </p>
            <p>
              Цей сервіс спростить збирання даних для декларації. На основі виписки про доходи він згрупує та підрахує 
              доходи за категоріями. Вам залишиться лише перенести ці дані до декларації. Він орієнтований на 
              інвесторів, тому аналізує лише доходи, що відносяться до інвестиційної діяльності (корпоративні та 
              державні облігації, депозити, кешбеки).
            </p>
          </Col>
        </Row>
        <Row>
          <Col lg={8} md={12}>
            <ol>
              <li>
                Подайте &quot;Запит про суми виплачених доходів&quot; через <a href="https://cabinet.tax.gov.ua/individual">Електронний кабінет платника податків</a>
              </li>
              <li>
                Завантажте отриманий звіт F1401803: <input type="file" onChange={onFileChange} accept=".xml" />
              </li>
              <li>
                Отримайте згруповані суми доходів та податки для рядків 10.10 та 11.3 податкової декларації. <u>Перед 
                внесенням даних до декларації перевірте, чи не проігнорував наш сервіс якісь доходи для цих рядків</u>. 
                <strong>Розробник не несе відповідальності за неправильні дані в декларації</strong> 
              </li>
            </ol>
            <p>Якщо ви знайшли помилку або у вас є пропозиції, пишіть мені <a href="mailto:paul.annekov+ua-declaration@gmail.com">на пошту</a>.</p>
          </Col>
        </Row>
        {!!income.length && <Row>
          <Col>
            <h2>Дані для декларації <small className="text-muted fs-5">{from} - {to}</small></h2>
          </Col>
        </Row>}
        {isWaryPeriod && <Row>
          <Col>
            <Alert variant="warning">
              Файл звіту має підозрілий період формування. Зазвичай він формується з першого по останній квартал 
              минулого року. Сподіваємось ви знаєте що робите. 
            </Alert>  
          </Col>
        </Row>}
        {!!income.length && <Row>
          <Col>
            <table className="table table-bordered">
              <thead className="text-center">
                <tr>
                  <th scope="col" rowSpan={3}>Код рядка</th>
                  <th scope="col" rowSpan={3}>ІІ. ДОХОДИ, ЯКІ ВКЛЮЧАЮТЬСЯ ДО ЗАГАЛЬНОГО РІЧНОГО ОПОДАТКОВУВАНОГО ДОХОДУ</th>
                  <th scope="col" rowSpan={3}>Сума доходів (грн, коп.)</th>
                  <th scope="col" colSpan={4}>Сума податку/збору (грн, коп.)</th>
                </tr>
                <tr>
                  <th scope="col" colSpan={2}>утриманого (сплаченого) податковим агентом</th>
                  <th scope="col" colSpan={2}>що підлягає сплаті самостійно</th>
                </tr>
                <tr>
                  <th scope="col">податок на доходи фізичних осіб</th>
                  <th scope="col">військовий збір</th>
                  <th scope="col">податок на доходи фізичних осіб</th>
                  <th scope="col">військовий збір</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6}>...</td>
                </tr>
                <tr>
                  <td>10.10</td>
                  <td>Інші доходи, у тому числі:</td>
                  <td className="text-end">{declarationNumbers.otherIncome.toString()}</td>
                  <td className="text-end">{declarationNumbers.taxPdfoOtherIncome.toString()}</td>
                  <td className="text-end">{declarationNumbers.taxMilitaryOtherIncome.toString()}</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={6}>...</td>
                </tr>
              </tbody>
            </table>
          </Col>
        </Row>}
        {!!income.length && <Row>
          <Col>
            <table className="table table-bordered">
              <thead className="text-center">
                <tr>
                  <th scope="col">Код рядка</th>
                  <th scope="col">ІІІ. ДОХОДИ, ЯКІ НЕ ВКЛЮЧАЮТЬСЯ ДО ЗАГАЛЬНОГО РІЧНОГО ОПОДАТКОВУВАНОГО ДОХОДУ</th>
                  <th scope="col">Сума доходів (грн, коп.)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3}>...</td>
                </tr>
                <tr>
                  <td>11.3</td>
                  <td>Інші доходи, що не підлягають оподаткуванню</td>
                  <td className="text-end">{declarationNumbers.noTaxIncome.toString()}</td>
                </tr>
              </tbody>
            </table>
          </Col>
        </Row>}
        {!!income.length && <Row>
          <Col><h2>Деталізація</h2></Col>
        </Row>}
        {!!income.length && <Row>
          <Col>
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
          <table className="table table-hover">
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
                <td>{formatDecimal(totals.incomeAccrued)}</td>
                <td></td>
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
      <ToastContainer className="p-3" position="top-center">
        {error && <Toast onClose={() => setError(undefined)} show={!!error} type={TOAST_TYPE.Error} body={error} /> }
      </ToastContainer>
      <footer className="mt-auto py-3">
        <a href="https://paul.annekov.com/">Павло Аннеков</a> 🇺🇦 2022
      </footer>
    </Container>
  )
}

export default Home
