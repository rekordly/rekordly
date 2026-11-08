FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/rekordly-api ./cmd/api
RUN CGO_ENABLED=0 go build -trimpath -o /out/rekordly-migrate ./cmd/migrate
RUN CGO_ENABLED=0 go build -trimpath -o /out/rekordly-healthcheck ./cmd/healthcheck

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/rekordly-api /rekordly-api
COPY --from=build /out/rekordly-migrate /rekordly-migrate
COPY --from=build /out/rekordly-healthcheck /rekordly-healthcheck
EXPOSE 8080
ENTRYPOINT ["/rekordly-api"]
