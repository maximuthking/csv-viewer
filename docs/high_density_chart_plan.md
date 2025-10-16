# 대용량·결측치 데이터 차트 개선 계획

## 1. 배경
- 현재 `/charts` 엔드포인트는 `dimensions` 조합별 최대 1000개의 그룹만 반환한다.  
- 사용 중인 데이터 세트는 결측치가 많고, 특정 기간/구간이 비어 있는 경우가 많기 때문에 1000개 그룹으로는 패턴을 파악하기 어렵다.  
- 빈 구간을 보간하거나 샘플링을 유연화하지 않으면 시간축/지리축 등에서 그래프가 끊어져 인사이트 확보가 어렵다.

## 2. 목표
1. 그룹 수 상한을 상황에 맞게 확장하고, 대량 데이터도 브라우저가 버티도록 서버/클라이언트 양쪽에 방어 전략을 마련한다.  
2. 결측 구간을 보간하거나 리샘플링해 균등한 간격의 시계열(또는 키값 시퀀스)을 차트로 제공한다.  
3. 사용자가 데이터 품질과 성능을 스스로 조절할 수 있도록 UI 옵션을 제공한다.

## 3. 단계별 구현안

### 3.1 백엔드
1. **그룹 상한 확장 및 스트리밍 대응**
   - `/charts` `limit` 기본값을 200 → 5000, 최대값을 1000 → 20000로 확장.
   - DuckDB 결과가 너무 클 경우 일정 크기(예: 2000행) 단위로 chunking하여 JSON 스트리밍 (`yield`) 또는 gzip 압축 응답 제공.
   - 요청 파라미터에 `sample_strategy`(e.g., `"first"`, `"even"`, `"random"`)를 추가해, limit 초과 시 서버가 샘플링 방식을 선택할 수 있게 함.

2. **결측치 보간/리샘플링 API**
   - `/charts/interpolate` (신규) 또는 `/charts` 옵션으로 추가:
     - `resample_interval` (예: `"1h"`, `"1d"`), `interpolation` 파라미터를 다중 선택 가능하도록 확장:
       - `"none"`: 보간 없이 원본만 반환 (기본값)
       - `"ffill"`/`"bfill"`: 전/후방 채우기
       - `"linear"`: 선형 보간
       - `"spline"`: 3차 스플라인(Polars/Scipy 활용, 옵션)
       - `"nearest"`: 가장 가까운 값 채택
     - DuckDB의 `window`, `generate_series`, `interp_linear` 등을 활용하거나 Polars를 도입해 고급 보간 처리. 스플라인 등 고급 방식은 Polars(또는 SciPy) 의존성 추가 후 백엔드에서 계산.
   - 시계열 외 범주형 키에 대해서는 허용 보간 방식을 제한하고, 지원 불가 시 명확한 에러 메시지 반환.

3. **캐시/변환**
   - Parquet 자동 변환 후, 추가로 시계열 인덱스를 기준으로 DuckDB 테이블에 캐싱 (선택).  
   - 특정 쿼리 조합/필터의 결과를 로컬 캐시에 저장해 반복 조회 시 빠르게 응답.

4. **환경 설정**
   - `.env`에 `CHART_MAX_LIMIT`, `CHART_STREAM_CHUNK_SIZE`, `DEFAULT_INTERPOLATION` 등 추가.

### 3.2 프런트엔드
1. **ChartBuilder 확장**
   - `Group limit` 슬라이더를 500~20,000 사이 값으로 확대.
   - `Sample strategy` 드롭다운과 `Interpolation`/`Resample interval` 옵션 추가.
   - 사용자가 고(高) limit를 선택하면 경고 배너(“브라우저 성능에 영향”) 표시.

2. **데이터 표시**
   - Plotly에 전달하기 전에 샘플 크기/보간 메타 정보를 툴팁 또는 범례로 표시.
   - 빈 구간이 있을 경우 회색 점선 등으로 “입력된 데이터 없음” 영역 강조.
   - limit가 큰 경우에는 로딩 스피너 + 단계별 결과(Progressive Rendering) 고려.
   - 보간 모드별로 선 스타일/색상을 다르게 표시(예: linear=solid, spline=curved)하여 사용자가 어떤 방식인지 직관적으로 인지.

3. **상태 관리**
   - Zustand store에 `chart.limit`, `chart.sampleStrategy`, `chart.interpolation`, `chart.resampleInterval` 등 추가.
   - 보간 방식에 따라 추가 파라미터(예: 스플라인 차수, 최근접 허용 거리 등)를 저장할 수 있도록 확장.
   - 서버 응답에서 `metadata`(샘플링 여부, 실제 그룹 수, 적용한 보간 방식)를 수신해 사용자에게 안내.

### 3.3 UX 가이드
1. 기본값은 기존과 동일하게 작은 limit + 보간 없음.
2. “고밀도 모드” 토글을 제공해 limit와 보간 옵션이 자동 조정되도록 함 (예: limit=10000, interpolation=linear).
3. 데이터 품질 리포트(결측 비율, 최대 연속 결측 길이)를 Summary 패널에 표시해 사용자가 보간 전/후 영향을 쉽게 이해할 수 있도록 지원.
4. 보간 방식 선택 시 사용자에게 간단한 설명과 권장 상황을 제공(예: “linear: 규칙적인 시계열”, “spline: 곡선형 추세 강조”, “nearest: 범주형 데이터”).


## 4. 테스트 전략
- **단위 테스트**: DuckDB 쿼리 빌더와 보간 함수에 대한 테스트 추가.  
- **통합 테스트**: `/charts`의 limit/샘플링/interpolation 조합별 응답 구조 검증.  
- **프런트 UI 테스트**: ChartBuilder에서 limit 조정, 보간 옵션 토글 시 올바른 API 호출 & 상태 업데이트 확인.  
- **부하 테스트**: 20,000 그룹 정도 데이터를 반환할 때 백엔드 응답 시간과 프런트 렌더링 성능 측정.

## 5. 향후 고려 사항
- WebSocket/Server-Sent Events를 사용해 대량 데이터 스트리밍 및 클라이언트 Progressive Rendering 구현.  
- Plotly 대신 데이터 포인트가 많은 시나리오에 최적화된 라이브러리(e.g., Apache ECharts, Lightning Chart) 도입 검토.  
- 보간/리샘플링을 서버 캐시에 저장해 동일 옵션 사용 시 재계산을 피하도록 최적화.
