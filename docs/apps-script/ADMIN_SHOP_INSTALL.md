# 관리자·쇼핑 서버 연결

상품 정보는 스프레드시트에 저장하지 않습니다. Apps Script의 서버 전용 `Script Properties`에 JSON 카탈로그로 저장하며, 기존 `보상` 시트는 사용자별 코인 원장으로 계속 사용합니다.

## 1. 서버 코드 추가

Apps Script 프로젝트에 새 스크립트 파일을 만들고 `coin-shopping-extension.gs`의 전체 내용을 붙여 넣습니다. 기존 `coin.gs`는 그대로 둡니다.

## 2. 관리자 고유 코드 설정

Apps Script 편집기의 **프로젝트 설정 → 스크립트 속성**에 아래 속성을 추가합니다.

- 속성: `MINITALK_ADMIN_CODE`
- 값: 관리자만 아는 충분히 긴 고유 코드

고유 코드는 모아루 소스나 HTML에 넣지 않습니다. 로그인 사용자가 설정 화면에서 입력하면 서버가 확인하고 6시간짜리 임시 토큰을 발급합니다. 토큰은 브라우저 메모리에만 유지되어 로그아웃이나 앱 재실행 시 폐기됩니다. `setupMiniTalkAdminCodeOnce`는 소스에 코드를 적는 실수를 막기 위해 안내 오류만 표시하므로, 반드시 프로젝트 설정에서 직접 등록합니다.

## 3. Code.gs 모드 연결

직접 분기를 수정하기 어렵다면 같은 폴더의 완성본 `Code.gs` 전체를 복사해 기존 Code.gs 내용을 통째로 교체하면 됩니다. 이 완성본은 사용자가 제공한 원본 Code.gs에 필요한 라우팅을 적용한 파일입니다.

기존 `doPost(e)`가 `mode`를 구분하는 부분에 아래 분기를 추가합니다.

```javascript
if (mode === "admin_unlock") return handleAdminUnlock(e);
if (mode === "shop_catalog") return handleShopCatalog(e);
if (mode === "shop_product_save") return handleShopProductSave(e);
if (mode === "shop_product_delete") return handleShopProductDelete(e);
if (mode === "shop_purchase") return handleShopPurchase(e);
if (mode === "shop_inventory") return handleShopInventory(e);
if (mode === "shop_gift") return handleShopGift(e);
if (mode === "shop_use") return handleShopUse(e);
if (mode === "admin_dispatch") return handleAdminDispatch(e);
if (mode === "admin_coin_reward") return handleAdminCoinReward(e);
if (mode === "admin_user_balances") return handleAdminUserBalances(e);
if (mode === "admin_task_assign") return handleAdminTaskAssign(e);
if (mode === "admin_task_list") return handleAdminTaskList(e);
if (mode === "admin_task_review") return handleAdminTaskReview(e);
if (mode === "user_task_list") return handleUserTaskList(e);
if (mode === "user_task_submit") return handleUserTaskSubmit(e);
if (mode === "user_commands") return handleUserCommands(e);
if (mode === "moaru_room_backup") return handleMoaruChatRoomBackup(e);
if (mode === "moaru_room_message_backup") return handleMoaruChatMessageBackup(e);
```

`mode` 변수 이름이 다르다면 기존 코드에서 사용하는 변수명에 맞춥니다. 모든 요청은 현재 미니톡의 `POST` 방식으로 전달됩니다.

## 4. 재배포

Apps Script에서 **배포 관리 → 새 버전 → 웹 앱 배포**를 실행합니다. 기존 배포 URL을 유지하는 새 버전이어야 미니톡 설정을 바꾸지 않아도 됩니다.

## 저장 구조

- `보상` 시트: 사용자별 현재 코인
- 관리자 코인 증감 화면은 `admin_user_balances`로 대상별 현재 잔액을 읽고, `admin_coin_reward`에 양수는 지급·음수는 차감으로 전달
- Script Properties의 상품별 `SHOP_PRODUCT_*`: 상품 이름·가격·설명·압축 이미지
- `구매로그` 시트: 네트워크 재시도 시 같은 구매가 두 번 차감되지 않게 하는 최소 거래 이력
- `소통` 시트: Firebase 전체 대화방 메시지의 기존 백업
- `대화방` 시트: Firebase의 전체방 외 대화방 메시지 기존 백업. 별도의 `미니톡_대화방백업`/`미니톡_메시지백업` 시트를 만들지 않음
- 문서 속성(`MOARU_TASK_*`): 관리자 지정 과제의 서버 원본. 학생 제출·반려·완료 상태를 저장하며 완료 48시간 후 원본만 삭제
- `모아루_과제백업` 시트: 배정·제출·반려·완료 이벤트의 추가 백업. 앱은 이 시트를 읽지 않으며, 서버 원본이 만료되어도 백업 기록은 유지

과제 완료 원본을 사용자가 접속하지 않는 시간에도 매일 정리하려면 Apps Script 함수 목록에서 `setupMoaruTaskCleanupTrigger`를 한 번 실행합니다. 과제 API도 호출될 때마다 만료 문서 속성을 자동 정리합니다. 이 기능은 스프레드시트에 연결된 Apps Script 프로젝트에서 사용해야 하며, 시트 백업은 정리 대상이 아닙니다.

기존 배포에서 잘못 생성된 `미니톡_대화방백업` 탭은 새 코드 배포 후 `removeObsoleteMiniTalkRoomBackupSheetOnce`를 한 번 실행하면 제거됩니다. 이 함수는 기존 `대화방` 탭이 없으면 삭제를 중단합니다.

`구매로그`도 시트에 두고 싶지 않다면 영속적인 서버 데이터베이스가 추가로 필요합니다. 일시 캐시만 사용하면 서버 재시작이나 캐시 만료 뒤 중복 차감을 확실히 막을 수 없습니다.
