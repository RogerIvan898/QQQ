package withdrawal

import (
	"context"
	"time"

	"go.uber.org/zap"

	"gitlab.com/company-group7340831/poker/chain-service/internal/schedule"
	"gitlab.com/company-group7340831/poker/chain-service/internal/ton"
)

// Таймауты одного обращения опросчика к хранилищу и к сети.
const (
	queryTimeout   = 10 * time.Second
	networkTimeout = 30 * time.Second
)

// ConfirmPollerConfig — параметры опроса подтверждений.
type ConfirmPollerConfig struct {
	Account    string        // горячий кошелёк, с которого уходят выводы
	Interval   time.Duration // период опроса
	Timeout    time.Duration // после этого срока вывод уходит на ручной разбор
	BatchSize  int           // сколько свежих выводов сверять за проход
	ScanLimit  int           // сколько последних транзакций кошелька читать за проход
	StaleEvery int           // зависшие проверяются раз в StaleEvery проходов
	StaleBatch int           // сколько зависших проверять за раз
	// MissesBeforeLookup — после стольких проходов, где свежий вывод не
	// нашёлся в окне последних транзакций, он ищется отдельно по хэшу: при
	// большом потоке депозитов вывод выпадает из окна задолго до таймаута.
	MissesBeforeLookup int
	LookupBatch        int // сколько таких поисков за проход
	// OnStale получает число выводов, ждущих ручного разбора (метрика).
	OnStale func(n int)
}

// ConfirmTON — то, что нужно опросчику от сети.
type ConfirmTON interface {
	// FindTransactions одним запросом ищет среди последних limit транзакций
	// кошелька те, что порождены внешними сообщениями с данными хэшами.
	FindTransactions(ctx context.Context, account string, msgHashes []string, limit int) (map[string]*ton.Tx, error)
	// FindTransaction ищет одну транзакцию по хэшу сообщения — для зависших,
	// которые уже выпали из окна последних транзакций.
	FindTransaction(ctx context.Context, msgHash string) (*ton.Tx, error)
}

// ConfirmPoller периодически проверяет отправленные выводы и публикует
// WITHDRAW_RESULT{confirmed|failed}.
//
// Свежие выводы (моложе CONFIRM_TIMEOUT) сверяются ОДНИМ запросом последних
// транзакций кошелька на проход: расход лимита toncenter не зависит от числа
// ожидающих выводов и почти не отнимается у broadcaster. Зависшие выводы
// проверяются отдельно, редко и по кругу (курсор по request_id), поэтому не
// забивают выборку и не мешают свежим.
//
// Порядок «сначала публикация, потом запись в БД»: если запись не удастся,
// следующий опрос опубликует тот же результат с тем же message_id.
//
// По истечении CONFIRM_TIMEOUT вывод НЕ объявляется failed (транзакция
// ещё может пройти): опросчик пишет ошибку для ручного разбора и
// продолжает проверять. failed — только для найденной прерванной транзакции.
type ConfirmPoller struct {
	cfg     ConfirmPollerConfig
	repo    Repository
	ton     ConfirmTON
	results *ResultPublisher
	log     *zap.Logger
	now     func() time.Time

	passes       int
	staleAfterID string         // курсор обхода зависших по кругу
	misses       map[string]int // request_id → проходы, где вывод не нашёлся в окне
}

// NewConfirmPoller создаёт опросчик.
func NewConfirmPoller(cfg ConfirmPollerConfig, repo Repository, client ConfirmTON, results *ResultPublisher, log *zap.Logger) *ConfirmPoller {
	if cfg.StaleEvery < 1 {
		cfg.StaleEvery = 12
	}
	if cfg.StaleBatch < 1 {
		cfg.StaleBatch = 5
	}
	if cfg.ScanLimit < 1 {
		cfg.ScanLimit = 100
	}
	if cfg.MissesBeforeLookup < 1 {
		cfg.MissesBeforeLookup = 3
	}
	if cfg.LookupBatch < 1 {
		cfg.LookupBatch = 3
	}
	if cfg.OnStale == nil {
		cfg.OnStale = func(int) {}
	}
	return &ConfirmPoller{cfg: cfg, repo: repo, ton: client, results: results, log: log.Named("confirm_poller"), now: time.Now, misses: map[string]int{}}
}

// Run опрашивает до отмены ctx; начатый проход дорабатывается.
func (p *ConfirmPoller) Run(ctx context.Context) error {
	p.log.Info("confirm poller started", zap.Duration("interval", p.cfg.Interval), zap.Duration("timeout", p.cfg.Timeout))
	schedule.Every(ctx, p.cfg.Interval, func() { p.Poll(ctx) })
	p.log.Info("confirm poller stopped")
	return nil
}

// Poll — один проход: свежие выводы, а раз в StaleEvery проходов — зависшие.
func (p *ConfirmPoller) Poll(ctx context.Context) {
	work := context.WithoutCancel(ctx)
	cutoff := p.now().Add(-p.cfg.Timeout)
	p.pollFresh(work, cutoff)

	p.passes++
	if p.passes%p.cfg.StaleEvery == 0 && ctx.Err() == nil {
		p.pollStale(work, cutoff)
	}
}

func (p *ConfirmPoller) pollFresh(ctx context.Context, cutoff time.Time) {
	qctx, cancel := context.WithTimeout(ctx, queryTimeout)
	fresh, err := p.repo.ListSent(qctx, cutoff, p.cfg.BatchSize)
	cancel()
	if err != nil {
		p.log.Warn("list sent withdrawals failed", zap.Error(err))
		return
	}
	if len(fresh) == 0 {
		return
	}

	hashes := make([]string, 0, len(fresh))
	for _, w := range fresh {
		hashes = append(hashes, w.MsgHash)
	}
	fctx, cancel := context.WithTimeout(ctx, networkTimeout)
	found, err := p.ton.FindTransactions(fctx, p.cfg.Account, hashes, p.cfg.ScanLimit)
	cancel()
	if err != nil {
		p.log.Warn("scan wallet transactions failed", zap.Error(err))
		return
	}
	pending := make(map[string]int, len(fresh))
	var lookup []Withdrawal
	for _, w := range fresh {
		if tx := found[w.MsgHash]; tx != nil {
			p.finalize(ctx, w, tx)
			continue
		}
		pending[w.RequestID] = p.misses[w.RequestID] + 1
		if pending[w.RequestID] >= p.cfg.MissesBeforeLookup && len(lookup) < p.cfg.LookupBatch {
			lookup = append(lookup, w)
		}
	}
	// Выводы, которых нет в выборке, уже завершены или стали зависшими.
	p.misses = pending

	for _, w := range lookup {
		lctx, cancel := context.WithTimeout(ctx, networkTimeout)
		tx, err := p.ton.FindTransaction(lctx, w.MsgHash)
		cancel()
		if err != nil {
			p.log.Warn("find transaction failed", zap.String("request_id", w.RequestID), zap.Error(err))
			continue
		}
		if tx != nil {
			p.finalize(ctx, w, tx)
			delete(p.misses, w.RequestID)
		} else {
			p.misses[w.RequestID] = 0 // следующий отдельный поиск — через MissesBeforeLookup проходов
		}
	}
}

func (p *ConfirmPoller) pollStale(ctx context.Context, cutoff time.Time) {
	cctx, cancel := context.WithTimeout(ctx, queryTimeout)
	if n, err := p.repo.CountStale(cctx, cutoff); err == nil {
		p.cfg.OnStale(n)
	} else {
		p.log.Warn("count stale withdrawals failed", zap.Error(err))
	}
	cancel()

	qctx, cancel := context.WithTimeout(ctx, queryTimeout)
	stale, err := p.repo.ListStale(qctx, cutoff, p.staleAfterID, p.cfg.StaleBatch)
	cancel()
	if err != nil {
		p.log.Warn("list stale withdrawals failed", zap.Error(err))
		return
	}
	if len(stale) < p.cfg.StaleBatch {
		p.staleAfterID = "" // круг пройден — в следующий раз с начала
	} else {
		p.staleAfterID = stale[len(stale)-1].RequestID
	}

	for _, w := range stale {
		fctx, cancel := context.WithTimeout(ctx, networkTimeout)
		tx, err := p.ton.FindTransaction(fctx, w.MsgHash)
		cancel()
		if err != nil {
			p.log.Warn("find transaction failed", zap.String("request_id", w.RequestID), zap.Error(err))
			continue
		}
		if tx != nil {
			p.finalize(ctx, w, tx)
			continue
		}
		// Не объявляем failed: BOC ещё может попасть в блок, и тогда ядро
		// вернуло бы деньги за прошедший вывод. Решение — за человеком.
		p.log.Error("transaction not found within confirm timeout, manual review required",
			zap.String("request_id", w.RequestID), zap.Uint32("seqno", w.Seqno),
			zap.String("msg_hash", w.MsgHash), zap.Time("sent_at", w.SentAt), zap.Duration("timeout", p.cfg.Timeout))
	}
}

// finalize публикует итог найденной транзакции и записывает его в БД.
func (p *ConfirmPoller) finalize(ctx context.Context, w Withdrawal, tx *ton.Tx) {
	ctx, cancel := context.WithTimeout(ctx, networkTimeout)
	defer cancel()
	log := p.log.With(zap.String("request_id", w.RequestID), zap.Uint32("seqno", w.Seqno), zap.String("msg_hash", w.MsgHash))

	res := Result{RequestID: w.RequestID, Status: ResultConfirmed, TxHash: tx.Hash, Seqno: w.Seqno}
	if !tx.Success {
		res.Status, res.Error = ResultFailed, tx.Reason
	}

	if _, err := p.results.Publish(ctx, res); err != nil {
		log.Error("publish result failed, will retry", zap.String("status", string(res.Status)), zap.Error(err))
		return
	}
	var err error
	if res.Status == ResultConfirmed {
		err = p.repo.MarkConfirmed(ctx, w.RequestID, res.TxHash)
	} else {
		err = p.repo.MarkFailed(ctx, w.RequestID, res.TxHash, res.Error)
	}
	if err != nil {
		log.Error("store result failed, will republish", zap.String("status", string(res.Status)), zap.Error(err))
		return
	}
	if res.Status == ResultConfirmed {
		log.Info("withdrawal confirmed", zap.String("tx_hash", res.TxHash))
	} else {
		log.Error("withdrawal failed", zap.String("tx_hash", res.TxHash), zap.String("reason", res.Error))
	}
}
