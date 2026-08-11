# 관리자·쇼핑 서버 연결

상품 정보는 스프레드시트에 저장하지 않습니다. Apps Script의 서버 전용 `Script Properties`에 JSON 카탈로그로 저장하며, 기존 `보상` 시트는 사용자별 코인 원장으로 계속 사용합니다.

## 1. 서버 코드 추가

Apps Script 프로젝트에 새 스크립트 파일을 만들고 `coin-shopping-extension.gs`의 전체 내용을 붙여 넣습니다. 기존 `coin.gs`는 그대로 둡니다.

## 2. 관리자 고유 코드 설정

Apps Script 편집기의 **프로젝트 설정 → 스크립트 속성**에 아래 속성을 추가합니다.

- 속성: `MINITALK_ADMIN_CODE`
- 값: 관리자만 아는 충분히 긴 고유 코드

고유 코드는 미니톡 소스나 HTML에 넣지 않습니다. 로그인 사용자가 설정 화면에서 입력하면 서버가 확인하고 6시간짜리 임시 토큰을 발급합니다. 토큰은 브라우저 메모리에만 유지되어 로그아웃이나 앱 재실행 시 폐기됩니다.

현재 요청한 고유 코드를 바로 설정하려면 Apps Script 상단 함수 선택에서 `setupMiniTalkAdminCodeOnce`를 골라 한 번 실행합니다. 실행 성공 후 `coin-shopping-extension.gs`의 해당 초기화 함수는 삭제해도 됩니다. 실제 인증 값은 Script Properties에 계속 남습니다.

## 3. Code.gs 모드 연결

직접 분기를 수정하기 어렵다면 같은 폴더의 완성본 `Code.gs` 전체를 복사해 기존 Code.gs 내용을 통째로 교체하면 됩니다. 이 완성본은 사용자가 제공한 원본 Code.gs에 필요한 라우팅을 적용한 파일입니다.

기존 `doPost(e)`가 `mode`를 구분하는 부분에 아래 분기를 추가합니다.

```javascript
if (mode === "admin_unlock") return handleAdminUnlock(e);
if (mode === "shop_catalog") return handleShopCatalog(e);
if (mode === "shop_product_save") return handleShopProductSave(e);
if (mode === "shop_product_delete") return handleShopProductDelete(e);
if (mode === "shop_purchase") return handleShopPurchase(e);
if (mode === "mini_talk_room_backup") return handleMiniTalkRoomBackup(e);
if (mode === "mini_talk_message_backup") return handleMiniTalkMessageBackup(e);
```

`mode` 변수 이름이 다르다면 기존 코드에서 사용하는 변수명에 맞춥니다. 모든 요청은 현재 미니톡의 `POST` 방식으로 전달됩니다.

## 4. 재배포

Apps Script에서 **배포 관리 → 새 버전 → 웹 앱 배포**를 실행합니다. 기존 배포 URL을 유지하는 새 버전이어야 미니톡 설정을 바꾸지 않아도 됩니다.

## 저장 구조

- `보상` 시트: 사용자별 현재 코인
- Script Properties의 상품별 `SHOP_PRODUCT_*`: 상품 이름·가격·설명·압축 이미지
- `구매로그` 시트: 네트워크 재시도 시 같은 구매가 두 번 차감되지 않게 하는 최소 거래 이력
- `미니톡_대화방백업`, `미니톡_메시지백업` 시트: Firebase 원본의 추가 백업. 앱은 이 시트를 읽지 않음

`구매로그`도 시트에 두고 싶지 않다면 영속적인 서버 데이터베이스가 추가로 필요합니다. 일시 캐시만 사용하면 서버 재시작이나 캐시 만료 뒤 중복 차감을 확실히 막을 수 없습니다.
