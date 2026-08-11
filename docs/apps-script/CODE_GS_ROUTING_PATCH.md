# 보내주신 Code.gs에 적용할 라우팅

현재 `doPost(e)`의 `switch (mode)` 안에서 기존 `coin_reward` 분기 바로 아래에 다음 분기를 추가합니다.

```javascript
      // 코인 잔액 조회: 미니톡은 POST 방식도 사용
      case "coin_status":
        return handleCoinStatus(e);

      // 로그인 후 관리자 고유 코드 검증 및 임시 토큰 발급
      case "admin_unlock":
        return handleAdminUnlock(e);

      // 서버 상품 카탈로그 조회
      case "shop_catalog":
        return handleShopCatalog(e);

      // 관리자 상품 등록·수정
      case "shop_product_save":
        return handleShopProductSave(e);

      // 관리자 상품 삭제
      case "shop_product_delete":
        return handleShopProductDelete(e);

      // 서버 가격 검증 후 코인 차감
      case "shop_purchase":
        return handleShopPurchase(e);
```

완성되는 주변 부분은 다음과 같습니다.

```javascript
      // 코인 보상 (출석/랭킹/퀘스트)
      case "coin_reward":
        return handleCoinReward(e);

      case "coin_status":
        return handleCoinStatus(e);

      case "admin_unlock":
        return handleAdminUnlock(e);

      case "shop_catalog":
        return handleShopCatalog(e);

      case "shop_product_save":
        return handleShopProductSave(e);

      case "shop_product_delete":
        return handleShopProductDelete(e);

      case "shop_purchase":
        return handleShopPurchase(e);

      case "fcm_push":
        return handleFcmPush_(e);
```

`coin-shopping-extension.gs`는 같은 Apps Script 프로젝트에 별도 `.gs` 파일로 추가합니다. Apps Script에서는 같은 프로젝트의 모든 `.gs` 파일이 함께 실행되므로 `Code.gs`에 확장 코드 전체를 합칠 필요는 없습니다.

## 관리자 코드

현재 요청한 코드는 `setupMiniTalkAdminCodeOnce`를 Apps Script 편집기에서 한 번 실행하면 서버 속성에 등록됩니다. 또는 다음 위치에서 직접 지정할 수 있습니다.

1. Apps Script 편집기 왼쪽의 **프로젝트 설정**을 엽니다.
2. **스크립트 속성**에서 속성 추가를 누릅니다.
3. 속성 이름은 `MINITALK_ADMIN_CODE`로 입력합니다.
4. 값에는 사용할 관리자 고유 코드를 입력합니다.

코드를 `.gs` 파일에 상수로 적지 않는 이유는 웹앱 코드 공유·백업 과정에서 노출되는 것을 피하기 위해서입니다.
