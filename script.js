// =====================================================
// 바이브 카페 주문서 - 기능 스크립트
// =====================================================


// -----------------------------------------------------
// 0. Supabase 연결 설정
// -----------------------------------------------------
// Supabase 대시보드 → Project Settings → API 에서 두 값을 복사해 넣으세요.
//   SUPABASE_URL: Project URL       (예: https://abcdefgh.supabase.co)
//   SUPABASE_KEY: anon public 키     (eyJ... 로 시작하는 긴 글자)
// ※ service_role 키는 절대 넣지 마세요! 브라우저 코드는 누구나 볼 수 있어요.
const SUPABASE_URL = 'https://gywfadbwftcypsjslqfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5d2ZhZGJ3ZnRjeXBzanNscWZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzOTU3ODIsImV4cCI6MjEwNjk3MTc4Mn0.PVlqxxrhj1IeehwXu5SoOhdzBrmruaMdm5MyFVNRg5I';

// 주문을 저장할 테이블 이름
const ORDER_TABLE = 'cafe_menu03';

// Supabase 클라이언트(= DB와 대화하는 도구) 만들기
// index.html에서 먼저 불러온 supabase-js가 전역 변수 supabase를 만들어 둡니다.
// URL/KEY가 비어 있으면 createClient가 에러를 내는데, 그러면 이 파일 전체가 멈춰서
// 금액 계산까지 안 되므로 try...catch로 감싸서 "연결만 실패"하도록 했어요.
let supabaseClient = null;
try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} catch (error) {
    console.error('Supabase 연결 설정을 확인하세요 (SUPABASE_URL / SUPABASE_KEY):', error);
}


// -----------------------------------------------------
// 1. 화면에서 사용할 요소(태그)들을 미리 찾아두기
// -----------------------------------------------------
// document.getElementById('아이디')는 HTML에서 해당 id를 가진 태그를 찾아줍니다.
// 자주 쓰는 요소는 변수에 담아두면 매번 찾지 않아도 되어 편리합니다.

// [주문하기 탭]
const orderForm = document.getElementById('order-form');       // 주문서 전체(form)
const nameInput = document.getElementById('customer-name');    // 이름 입력칸
const phoneInput = document.getElementById('customer-phone');  // 전화번호 입력칸
const drinkSelect = document.getElementById('drink');          // 음료 드롭다운
const quantityInput = document.getElementById('quantity');     // 수량 입력칸
const requestInput = document.getElementById('request');       // 요청사항 입력칸
const totalPriceText = document.getElementById('total-price'); // 예상 금액 숫자 부분
const orderResult = document.getElementById('order-result');   // 주문 확인 메시지 영역
const orderButton = document.getElementById('order-btn');      // 주문하기 버튼

// [탭 메뉴]
const tabButtons = document.querySelectorAll('.tab');          // 탭 버튼 2개
const orderCountBadge = document.getElementById('order-count'); // 주문 건수 배지

// [주문 내역 탭]
const emptyMessage = document.getElementById('empty-message');   // "아직 주문 내역이 없어요" 안내
const orderList = document.getElementById('order-list');         // 주문 카드가 들어갈 <ul>
const orderSummary = document.getElementById('order-summary');   // 합계 + 전체 삭제 영역
const summaryTotal = document.getElementById('summary-total');   // 총 주문 금액 숫자
const summaryCount = document.getElementById('summary-count');   // 총 주문 건수 숫자
const clearOrdersBtn = document.getElementById('clear-orders-btn'); // 내역 모두 지우기 버튼


// -----------------------------------------------------
// 2. 주문 내역을 저장할 곳
// -----------------------------------------------------
// orders 배열에 주문 1건마다 객체({ ... }) 하나씩 저장합니다.
// 최신 주문이 맨 앞(0번)에 오도록 unshift()로 추가할 거예요.
let orders = [];

// 다음 주문에 붙일 주문번호 (#1, #2, ...)
// 주문을 취소해도 번호는 다시 쓰지 않고 계속 커집니다. (같은 번호가 두 번 나오지 않게)
let nextOrderNumber = 1;


// -----------------------------------------------------
// 3. 수량 값을 안전하게 가져오는 함수
// -----------------------------------------------------
// 사용자가 수량 칸을 비우거나 0, 99 같은 값을 직접 입력할 수도 있어요.
// 그래서 항상 1 ~ 10 사이의 정수가 나오도록 정리해서 돌려줍니다.
function getQuantity() {
    // input의 값(value)은 항상 '문자열'이라서 Number()로 숫자로 바꿔줍니다.
    let quantity = Math.floor(Number(quantityInput.value));

    // 숫자가 아니거나(NaN) 1보다 작으면 1로
    if (isNaN(quantity) || quantity < 1) {
        quantity = 1;
    }
    // 10보다 크면 10으로
    if (quantity > 10) {
        quantity = 10;
    }
    return quantity;
}


// -----------------------------------------------------
// 4. 예상 금액을 계산하는 함수 (계산은 여기 한 곳에서만!)
// -----------------------------------------------------
// 계산 공식: (음료 가격 + 사이즈 추가금 + 옵션 추가금 합계) × 수량
// 계산 결과(숫자)를 return 해주기 때문에 금액 표시, 주문 메시지 등
// 여러 곳에서 이 함수 하나를 재사용할 수 있습니다.
function calculateTotal() {
    // (1) 음료 가격
    // selectedOptions[0]은 드롭다운에서 지금 선택된 <option> 태그입니다.
    // dataset.price는 HTML의 data-price="3500" 값을 읽어옵니다. (문자열 → 숫자로 변환)
    const selectedDrink = drinkSelect.selectedOptions[0];
    const drinkPrice = Number(selectedDrink.dataset.price);

    // 음료를 아직 고르지 않았다면(value가 빈 문자열) 0원
    if (drinkSelect.value === '') {
        return 0;
    }

    // (2) 사이즈 추가금
    // :checked 는 "체크된 것"만 고르는 선택자입니다. 라디오는 하나만 체크되니 하나만 찾으면 돼요.
    const selectedSize = document.querySelector('input[name="size"]:checked');
    // 혹시 사이즈가 하나도 선택되지 않았다면 추가금 0원
    const sizePrice = selectedSize ? Number(selectedSize.dataset.price) : 0;

    // (3) 추가 옵션 추가금 합계
    // 체크박스는 여러 개 선택될 수 있으니 querySelectorAll로 체크된 것을 모두 찾고,
    // forEach로 하나씩 돌면서 가격을 더해줍니다.
    let optionPrice = 0;
    const checkedOptions = document.querySelectorAll('input[name="options"]:checked');
    checkedOptions.forEach(function (option) {
        optionPrice = optionPrice + Number(option.dataset.price);
    });

    // (4) 한 잔 가격 × 수량 = 총 금액
    const onePrice = drinkPrice + sizePrice + optionPrice;
    return onePrice * getQuantity();
}


// -----------------------------------------------------
// 5. 계산된 금액을 화면에 표시하는 함수
// -----------------------------------------------------
// toLocaleString()은 숫자에 천 단위 콤마를 붙여줍니다. 예) 5000 → "5,000"
// HTML에 "예상 금액: <span>0</span>원" 형태로 되어 있어서 숫자 부분만 바꿔주면 됩니다.
function updateTotalPrice() {
    totalPriceText.textContent = calculateTotal().toLocaleString();
}


// -----------------------------------------------------
// 6. 이름표(글자)에서 상품 이름만 뽑아내는 도우미 함수들
// -----------------------------------------------------
// 음료: "카페라떼 4,000원" → 마지막 띄어쓰기 앞까지 자르면 "카페라떼"
function getDrinkName() {
    const text = drinkSelect.selectedOptions[0].textContent;
    return text.slice(0, text.lastIndexOf(' '));
}

// 옵션: <label for="option-shot">샷 추가 (+500원)</label>
//       → " (" 앞까지 자르면 "샷 추가"
function getOptionName(checkbox) {
    // 체크박스의 id와 같은 for 값을 가진 label을 찾습니다.
    const label = document.querySelector('label[for="' + checkbox.id + '"]');
    const text = label.textContent;
    return text.slice(0, text.indexOf(' ('));
}


// -----------------------------------------------------
// 7. 주문 내용을 한 줄 문장으로 만드는 함수
// -----------------------------------------------------
// 예) "카페라떼 M사이즈 (샷 추가) 1잔"
// 주문 확인 메시지와 주문 내역 카드 두 곳에서 똑같이 쓰기 때문에 함수로 만들었어요.
function getOrderDescription(order) {
    // 옵션이 있을 때만 " (샷 추가, 시럽 추가)" 형태로 만들고, 없으면 빈 문자열
    // join(', ')은 배열을 ", "로 이어 붙여 하나의 문자열로 만들어 줍니다.
    let optionText = '';
    if (order.options.length > 0) {
        optionText = ' (' + order.options.join(', ') + ')';
    }
    // 백틱(`)과 ${변수}를 쓰면 문자열 안에 변수를 바로 넣을 수 있어요. (템플릿 문자열)
    return `${order.drink} ${order.size}사이즈${optionText} ${order.quantity}잔`;
}


// -----------------------------------------------------
// 8. 입력값이 바뀔 때마다 금액을 다시 계산하기
// -----------------------------------------------------
// form 안의 어떤 입력칸이든 값이 바뀌면 'input' 이벤트가 form까지 전달됩니다.
// (이벤트 버블링) 그래서 form 하나에만 이벤트를 걸어도 음료, 사이즈,
// 옵션, 수량 변경을 모두 감지할 수 있어요.
orderForm.addEventListener('input', updateTotalPrice);


// -----------------------------------------------------
// 9. 주문하기 버튼 (form 제출)
// -----------------------------------------------------
// async: 이 함수 안에서 await(기다리기)를 쓰겠다는 표시입니다.
// DB 저장은 인터넷을 거치므로 시간이 걸려서, 끝날 때까지 기다렸다가 다음 줄로 넘어가야 해요.
orderForm.addEventListener('submit', async function (event) {
    // form은 제출되면 기본적으로 페이지를 새로고침합니다.
    // preventDefault()로 그 기본 동작을 막아야 화면에 메시지를 보여줄 수 있어요.
    event.preventDefault();

    // (1) 이름 검사 - trim()은 앞뒤 공백을 지워줍니다. (공백만 입력한 경우 방지)
    const customerName = nameInput.value.trim();
    if (customerName === '') {
        alert('이름을 입력해주세요');
        nameInput.focus(); // 이름 칸으로 커서를 옮겨줍니다.
        return;            // return을 만나면 함수가 여기서 끝납니다. (주문 진행 X)
    }

    // (2) 음료 선택 검사
    if (drinkSelect.value === '') {
        alert('음료를 선택해주세요');
        drinkSelect.focus();
        return;
    }

    // (3) 주문 정보 모으기
    const quantity = getQuantity();
    quantityInput.value = quantity; // 범위를 벗어난 수량을 입력했다면 정리된 값으로 바꿔 보여주기

    // 체크된 옵션들의 이름을 배열에 담기 → 예) ["샷 추가", "시럽 추가"]
    const optionNames = [];
    document.querySelectorAll('input[name="options"]:checked').forEach(function (option) {
        optionNames.push(getOptionName(option));
    });

    // 주문 1건을 객체 하나로 묶기
    const order = {
        number: nextOrderNumber,                    // 주문번호
        name: customerName,                         // 이름
        phone: phoneInput.value.trim(),             // 전화번호 (없으면 빈 문자열)
        drink: getDrinkName(),                      // 음료 이름
        drinkPrice: Number(drinkSelect.selectedOptions[0].dataset.price), // 음료 기본 가격
        size: document.querySelector('input[name="size"]:checked').value, // "S", "M", "L"
        options: optionNames,                       // 옵션 이름 배열
        quantity: quantity,                         // 수량
        request: requestInput.value.trim(),         // 요청사항 (없으면 빈 문자열)
        total: calculateTotal(),                    // 금액 (calculateTotal 재사용)
        time: new Date()                            // 주문 시간 (지금 이 순간)
    };

    // (4) Supabase DB에 저장하기
    // URL/KEY를 아직 안 넣어서 클라이언트가 없으면 저장할 수 없어요.
    if (supabaseClient === null) {
        alert('주문 저장에 실패했어요');
        console.error('Supabase 클라이언트가 없습니다. script.js 맨 위의 SUPABASE_URL, SUPABASE_KEY를 확인하세요.');
        return;
    }

    // 저장하는 동안 버튼을 잠가서 두 번 눌러 같은 주문이 두 번 들어가는 것을 막아요.
    orderButton.disabled = true;
    orderButton.textContent = '주문 저장 중...';

    // try...finally: 저장이 성공하든 실패하든(에러가 나도) finally 안의 코드는 꼭 실행돼요.
    // → 버튼이 잠긴 채로 남는 일이 없도록 버튼 되돌리기를 finally에 넣었어요.
    try {
        // insert(): 테이블에 새 줄을 추가합니다.
        // { 열 이름: 값 } 형태로, 왼쪽은 DB 테이블의 열 이름과 똑같이 써야 해요.
        const { error } = await supabaseClient
            .from(ORDER_TABLE)
            .insert({
                customer_name: order.name,
                phone: order.phone,
                drink: order.drink,
                drink_price: order.drinkPrice,
                size: order.size,
                options: order.options,       // 배열 그대로 보내면 DB의 text[] 열에 저장돼요.
                quantity: order.quantity,
                request: order.request,
                total_price: order.total
            });

        // Supabase는 실패해도 에러를 "던지지" 않고 error 값에 담아 돌려줘요.
        // 그래서 error가 있는지 직접 확인해야 합니다.
        if (error) {
            alert('주문 저장에 실패했어요');
            console.error('주문 저장 실패:', error); // 개발자 도구(F12) → Console 탭에서 원인 확인
            return; // 저장 실패 → 주문 내역/확인 메시지로 넘어가지 않음
        }
    } catch (error) {
        // 인터넷이 끊기는 등 예상치 못한 에러도 같은 방식으로 알려줘요.
        alert('주문 저장에 실패했어요');
        console.error('주문 저장 중 에러:', error);
        return;
    } finally {
        // 성공/실패 상관없이 버튼을 다시 누를 수 있게 되돌리기
        orderButton.disabled = false;
        orderButton.textContent = '주문하기';
    }

    // ----- 여기부터는 DB 저장에 성공했을 때만 실행돼요 -----

    // (5) 주문 내역에 추가 - unshift()는 배열 맨 앞에 넣어줘서 최신 주문이 맨 위에 와요.
    orders.unshift(order);
    nextOrderNumber = nextOrderNumber + 1;
    renderOrders(); // 주문 내역 화면과 배지 숫자를 새로 그리기

    // (6) 주문 확인 메시지 만들기
    const message = `${order.name}님, ${getOrderDescription(order)}, 총 ${order.total.toLocaleString()}원 주문이 접수되었습니다!`;

    // (7) 메시지를 넣고, 숨겨져 있던 영역을 보이게 하기 (hidden 클래스 빼기)
    // 손님이 입력한 이름이 들어가므로 innerHTML이 아닌 textContent를 써요. (보안)
    orderResult.textContent = message;
    orderResult.classList.remove('hidden');
    updateTotalPrice();
});


// -----------------------------------------------------
// 10. 다시 작성 버튼 (form 초기화)
// -----------------------------------------------------
// 다시 작성 버튼은 type="reset"이라서 브라우저가 알아서 모든 입력을
// HTML에 처음 적힌 값으로 되돌려 줍니다. (M 사이즈 checked, 수량 value="1")
// ※ 주문 내역(orders 배열)은 건드리지 않으므로 그대로 남아 있어요.
orderForm.addEventListener('reset', function () {
    // 주의! 'reset' 이벤트는 값이 실제로 초기화되기 "직전"에 실행됩니다.
    // 그래서 setTimeout(..., 0)으로 초기화가 끝난 "직후"에 금액을 다시 계산합니다.
    setTimeout(function () {
        updateTotalPrice(); // 음료 선택이 풀렸으므로 0원이 됩니다.
    }, 0);

    // 주문 확인 메시지도 지우고 다시 숨기기 (hidden 클래스 붙이기)
    orderResult.textContent = '';
    orderResult.classList.add('hidden');
});


// -----------------------------------------------------
// 11. 탭 전환
// -----------------------------------------------------
// 탭 버튼의 data-panel 값(예: "history-panel")이 보여줄 영역의 id입니다.
// 클릭한 탭만 active 클래스를 붙이고, 해당 영역만 hidden 클래스를 뺍니다.
tabButtons.forEach(function (tab) {
    tab.addEventListener('click', function () {
        tabButtons.forEach(function (otherTab) {
            const panel = document.getElementById(otherTab.dataset.panel);

            if (otherTab === tab) {
                // 클릭한 탭 → 선택 표시 + 영역 보이기
                otherTab.classList.add('active');
                panel.classList.remove('hidden');
            } else {
                // 나머지 탭 → 선택 해제 + 영역 숨기기
                otherTab.classList.remove('active');
                panel.classList.add('hidden');
            }
        });
    });
});


// -----------------------------------------------------
// 12. 주문 내역 목록을 화면에 그리는 함수 (목록 그리기는 여기 한 곳에서만!)
// -----------------------------------------------------
// orders 배열이 바뀔 때마다(주문 추가, 취소, 전체 삭제) 이 함수를 불러서
// 목록을 처음부터 다시 그립니다. 이렇게 하면 화면과 배열이 항상 일치해요.
function renderOrders() {
    // (1) 기존 목록 비우기
    orderList.textContent = '';

    // (2) 주문 건수 배지 - 주문이 있을 때만 숫자를 보여줌
    orderCountBadge.textContent = orders.length;
    orderCountBadge.classList.toggle('hidden', orders.length === 0);
    // ↑ toggle('클래스', 조건): 조건이 true면 클래스를 붙이고, false면 뺍니다.

    // (3) 주문이 없을 때: 안내 문구만 보여주고 합계 영역은 숨기기
    if (orders.length === 0) {
        emptyMessage.classList.remove('hidden');
        orderSummary.classList.add('hidden');
        return;
    }
    emptyMessage.classList.add('hidden');
    orderSummary.classList.remove('hidden');

    // (4) 주문을 하나씩 카드로 만들어 목록에 넣기
    let sum = 0; // 총 주문 금액 합계

    orders.forEach(function (order) {
        sum = sum + order.total;

        // 카드(<li>) 만들기
        // ※ 손님이 입력한 글자(이름, 요청사항)는 반드시 textContent로 넣어요.
        //   innerHTML로 넣으면 <script> 같은 코드가 실행될 수 있어 위험합니다.
        const card = document.createElement('li');
        card.className = 'order-card';

        // 1줄: "#1 홍길동님 · 5,000원"
        const title = document.createElement('p');
        title.className = 'order-title';
        title.textContent = `#${order.number} ${order.name}님 · ${order.total.toLocaleString()}원`;

        // 2줄: "카페라떼 M사이즈 (샷 추가) 1잔"
        const detail = document.createElement('p');
        detail.className = 'order-detail';
        detail.textContent = getOrderDescription(order);

        // 3줄: 요청사항(있을 때만) · 주문 시간
        // toLocaleTimeString으로 "오후 03:25" 같은 한국식 시간 글자를 만들어요.
        const timeText = order.time.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const meta = document.createElement('p');
        meta.className = 'order-meta';
        if (order.request !== '') {
            meta.textContent = `${order.request} · ${timeText}`;
        } else {
            meta.textContent = timeText;
        }

        // 오른쪽 위 취소 버튼
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'cancel-btn';
        cancelBtn.textContent = '취소';
        cancelBtn.addEventListener('click', function () {
            // confirm()은 [확인]을 누르면 true, [취소]를 누르면 false를 돌려줘요.
            if (confirm(`#${order.number} ${order.name}님의 주문을 취소할까요?`)) {
                // filter()는 조건에 맞는 것만 남긴 새 배열을 만들어요.
                // → 지금 카드의 주문(번호가 같은 것)만 빼고 나머지를 남깁니다.
                orders = orders.filter(function (item) {
                    return item.number !== order.number;
                });
                renderOrders(); // 바뀐 배열로 다시 그리기
            }
        });

        // 만든 조각들을 카드에 넣고, 카드를 목록에 넣기
        card.append(title, detail, meta, cancelBtn);
        orderList.appendChild(card);
    });

    // (5) 목록 아래 합계: "총 주문 금액: 15,000원 (3건)"
    summaryTotal.textContent = sum.toLocaleString();
    summaryCount.textContent = orders.length;
}


// -----------------------------------------------------
// 13. 내역 모두 지우기 버튼
// -----------------------------------------------------
clearOrdersBtn.addEventListener('click', function () {
    if (confirm('주문 내역을 모두 지울까요?')) {
        orders = [];     // 배열을 빈 배열로 바꾸고
        renderOrders();  // 다시 그리면 "아직 주문 내역이 없어요" 안내가 나와요.
    }
});


// -----------------------------------------------------
// 14. 페이지가 처음 열렸을 때 한 번 실행
// -----------------------------------------------------
// (브라우저가 새로고침 전 입력값을 기억하는 경우에도 금액이 맞게 나오도록)
updateTotalPrice();
renderOrders();
