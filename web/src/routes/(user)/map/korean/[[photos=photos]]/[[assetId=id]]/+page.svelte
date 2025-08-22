<!-- src/lib/components/NaverBasicMap.svelte -->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { getMapMarkers, type MapMarkerResponseDto } from '@immich/sdk';
  import { mapSettings } from '$lib/stores/preferences.store';
  import { DateTime, Duration } from 'luxon';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { navigate } from '$lib/utils/navigation';
  import { handlePromiseError } from '$lib/utils';
  import Portal from '$lib/components/shared-components/portal/portal.svelte';


  const CLIENT_ID = import.meta.env.VITE_NAVER_CLIENT_ID  ?? 'YOUR_NAVER_MAP_CLIENT_ID';

  let { isViewing: showAssetViewer, asset: viewingAsset, setAssetId } = assetViewingStore;

  let mapEl: HTMLDivElement;
  let abortController: AbortController | null = null;

  // 기본 뷰
  const center = { lat: 36.5, lng: 127.8 };
  const zoom = 7;

  declare global {
    interface Window {
      naver?: any;
      MarkerClustering?: any;
    }
  }

  /** 같은 src가 이미 있으면 그 태그의 load를 기다리고, 없으면 추가해서 load를 기다림 */
  function appendScriptOnce(src: string, ready: () => boolean) {
    return new Promise<void>((resolve, reject) => {
      if (ready()) return resolve();

      const existing = Array.from(document.scripts).find((s) => s.src === src);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Failed: ${src}`)), { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed: ${src}`));
      document.head.appendChild(s);
    });
  }

  async function loadNaverStack() {
    // 1) maps.js (반드시 ncpClientId 사용)
    const mapsUrl = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`;
    await appendScriptOnce(mapsUrl, () => !!window.naver?.maps);

    // 2) MarkerClustering.js (maps.js 이후)
    await appendScriptOnce('/MarkerClustering.js', () => !!window.MarkerClustering);
  }

  function getFileCreatedDates() {
    const { relativeDate, dateAfter, dateBefore } = $mapSettings;

    if (relativeDate) {
      const duration = Duration.fromISO(relativeDate);
      return {
        fileCreatedAfter: duration.isValid ? DateTime.now().minus(duration).toISO() : undefined,
      };
    }

    try {
      return {
        fileCreatedAfter: dateAfter ? new Date(dateAfter).toISOString() : undefined,
        fileCreatedBefore: dateBefore ? new Date(dateBefore).toISOString() : undefined,
      };
    } catch {
      $mapSettings.dateAfter = '';
      $mapSettings.dateBefore = '';
      return {};
    }
  }

  async function loadMapMarkers(): Promise<MapMarkerResponseDto[]> {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const { includeArchived, onlyFavorites, withPartners, withSharedAlbums } = $mapSettings;
    const { fileCreatedAfter, fileCreatedBefore } = getFileCreatedDates();

    return getMapMarkers(
      {
        isArchived: includeArchived || undefined,
        isFavorite: onlyFavorites || undefined,
        fileCreatedAfter: fileCreatedAfter || undefined,
        fileCreatedBefore,
        withPartners: withPartners || undefined,
        withSharedAlbums: withSharedAlbums || undefined,
      },
      { signal: abortController.signal },
    );
  }

  let viewingAssets: string[] = $state([]);
  let viewingAssetCursor = 0;

  async function onViewAssets(assetIds: string[]) {
    viewingAssets = assetIds;
    viewingAssetCursor = 0;
    await setAssetId(assetIds[0]);
  }



  async function navigateNext() {
    if (viewingAssetCursor < viewingAssets.length - 1) {
      await setAssetId(viewingAssets[++viewingAssetCursor]);
      await navigate({ targetRoute: 'current', assetId: $viewingAsset.id });
      return true;
    }
    return false;
  }

  async function navigatePrevious() {
    if (viewingAssetCursor > 0) {
      await setAssetId(viewingAssets[--viewingAssetCursor]);
      await navigate({ targetRoute: 'current', assetId: $viewingAsset.id });
      return true;
    }
    return false;
  }

  onMount(async () => {
    try {
      // 스크립트 로드 순서 보장
      await loadNaverStack();
      await tick();

      const naver = window.naver;

      // 데이터 로드
      const markerList = await loadMapMarkers();

      // 지도 생성
      const map = new naver.maps.Map(mapEl, {
        center: new naver.maps.LatLng(center.lat, center.lng),
        useStyleMap: true,
        zoom,
        minZoom: 7,
        mapTypeControl: true,
        mapTypeControlOptions: {
          style: naver.maps.MapTypeControlStyle.BUTTON,
          position: naver.maps.Position.TOP_LEFT,
        },
        zoomControl: false,
      });
      const ICON_PX = 80; // ← 원하는 크기로 (예: 64, 80, 100)

      // 개별 마커 생성 (초기엔 map을 세팅하지 않아 깜빡임 방지)
      const markers = markerList.map((o) => {
        const url = `/api/assets/${o.id}/thumbnail`;
        const m = new naver.maps.Marker({
          position: new naver.maps.LatLng(o.lat, o.lon),
          icon: {
            content: `
        <div style="width:${ICON_PX}px;height:${ICON_PX}px;border-radius:12px;overflow:hidden;
                    box-shadow:0 4px 12px rgba(0,0,0,.25);border:3px solid #fff">
          <img src="${url}" alt="" draggable="false" ondragstart="return false;"
               style="width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none;user-select:none;">
        </div>`,
            anchor: new naver.maps.Point(ICON_PX / 2, ICON_PX / 2),
          },
        });
        m.set('id', o.id); // ★ 저장
        

        naver.maps.Event.addListener(m, 'mouseover', () => {
          const el = m.getElement();
          if (!el) return;
          el.style.transition = 'transform 120ms ease';
          el.style.transformOrigin = 'center';
          el.style.transform = 'translateZ(0) scale(1.08)';
          el.style.zIndex = '900';
        });

        naver.maps.Event.addListener(m, 'mouseout', () => {
          const el = m.getElement();
          if (!el) return;
          el.style.transform = 'scale(1)';
          el.style.zIndex = '';
        });
        return m;


      });

      // 클러스터 아이콘(HTML 마커)
      const makeIcon = (size: number) => ({
        content: `
        <div style="position:relative;width:${ICON_PX}px;height:${ICON_PX}px;border-radius:12px;overflow:hidden;
            box-shadow:0 4px 12px rgba(0,0,0,.25);border:3px solid #fff">
  <img src="" alt="" draggable="false" ondragstart="return false;"
       style="width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none;user-select:none;">
  <!-- 숫자 배지: 왼쪽 아래 -->
  <div class="badge" style="
       position:absolute;left:1px;bottom:1px;
       min-width:20;height:20px;padding:0 6px;
       display:flex;align-items:center;justify-content:center;
       border-radius:9999px;background:rgba(234,67,53,.95);
       color:#fff;font-weight:800;font-size:12px;line-height:1;
       box-shadow:0 2px 6px rgba(0,0,0,.25);
       pointer-events:none;">03344</div>
</div>`,
        size: new naver.maps.Size(size, size),
        anchor: new naver.maps.Point(size / 2, size / 2),
      });

      // 기존보다 한 단계씩 크게
      const icons = [makeIcon(56), makeIcon(64), makeIcon(72), makeIcon(84)];

      // 클러스터러
      const mc = new window.MarkerClustering({
        map,
        markers,
        minClusterSize: 2,
        maxZoom: Infinity, // 확대해도 계속 클러스터 유지 (필요시 임계값으로 조정)
        gridSize: 60, // 화면 기준 픽셀. 필요에 따라 60~150 조정
        icons,
        indexGenerator: [1, 2, 3],
        disableClickZoom: true,
        stylingFunction: (clusterMarker: any, count: number) => {
          const cluster = clusterMarker.get('cluster');
          const el = clusterMarker.getElement();
          if (el) {
            const badge = el.querySelector('.badge') as HTMLDivElement;
            badge.textContent = String(count);
            const url = `/api/assets/${cluster._clusterMember[0].id}/thumbnail`;
            const src = url;
            el.querySelector('img').src = src;
          }
          naver.maps.Event.addListener(clusterMarker, 'click', (e) => {
            const ids = clusterMarker.get('cluster')._clusterMember.map(o => o.id);
            onViewAssets(ids);
          });
          naver.maps.Event.addListener(clusterMarker, 'mouseover', () => {
            const el = clusterMarker.getElement();
            if (!el) return;
            el.style.transition = 'transform 120ms ease';
            el.style.transformOrigin = 'center';

            el.style.transform = 'translateZ(0) scale(1.08)';
            el.style.zIndex = 1;

          });

          naver.maps.Event.addListener(clusterMarker, 'mouseout', () => {
            const el = clusterMarker.getElement();
            if (!el) return;
            el.style.transform = 'scale(1)';
            el.style.zIndex = '';
          });
        },
      });

      // 디버깅용: 카메라 이동 후 중심/줌 출력
      const idleListener = naver.maps.Event.addListener(map, 'idle', () => {
        const c = map.getCenter();
        // console.log('center:', c.lat(), c.lng(), 'zoom:', map.getZoom());
      });

      // 개별 마커 클릭 예시
      markers.forEach((m, idx) => {
        naver.maps.Event.addListener(m, 'click', () => {
          onViewAssets([m.id])
        });
      });

      // 정리
      return () => {
        naver.maps.Event.removeListener(idleListener);
        mc?.setMap(null);
        abortController?.abort();
      };
    } catch (e) {
      // console.error('Map init failed:', e);
    }
  });
</script>

<div>
  <UserPageLayout title={'국내지도'}>
    <div bind:this={mapEl} class="isolate h-full w-full"></div>
  </UserPageLayout>

  <Portal target="body">
    {#if $showAssetViewer}
      {#await import('../../../../../../lib/components/asset-viewer/asset-viewer.svelte') then { default: AssetViewer }}
        <AssetViewer
          asset={$viewingAsset}
          showNavigation={viewingAssets.length > 1}
          onNext={navigateNext}
          onPrevious={navigatePrevious}
          onRandom={()=>{}}
          onClose={() => {
            assetViewingStore.showAssetViewer(false);
            handlePromiseError(navigate({ targetRoute: 'current', assetId: null }));
          }}
          isShared={false}
        />
      {/await}
    {/if}
  </Portal>
</div>
